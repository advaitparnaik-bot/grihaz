import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

// Get today's date in IST (UTC+5:30)
function getTodayIST(): string {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istDate = new Date(now.getTime() + istOffset)
  return istDate.toISOString().split('T')[0]
}

// Get day name in lowercase from a date string (YYYY-MM-DD)
function getDayName(dateStr: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const date = new Date(dateStr + 'T00:00:00Z')
  return days[date.getUTCDay()]
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = getAdminClient()
    const today = getTodayIST()
    const todayDay = getDayName(today)

    // Get all active regular staff with a schedule across all homes
    const { data: allStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, home_id, schedule')
      .eq('active', true)
      .eq('staff_type', 'regular')
      .not('schedule', 'is', null)

    if (staffError) throw staffError
    if (!allStaff?.length) return new Response(
      JSON.stringify({ message: 'No active staff found', marked: 0 }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

    // Filter staff scheduled for today
    const scheduledToday = allStaff.filter(s =>
      Array.isArray(s.schedule) && s.schedule.includes(todayDay)
    )

    if (!scheduledToday.length) return new Response(
      JSON.stringify({ message: 'No staff scheduled today', marked: 0 }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

    // Get current contracts active today
    const staffIds = scheduledToday.map(s => s.id)
    const { data: contracts } = await supabase
      .from('staff_contracts')
      .select('staff_id, effective_from, effective_to')
      .in('staff_id', staffIds)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)

    const contractMap = new Set((contracts || []).map(c => c.staff_id))

    // Filter to staff with an active contract today
    const eligibleStaff = scheduledToday.filter(s => contractMap.has(s.id))

    if (!eligibleStaff.length) return new Response(
      JSON.stringify({ message: 'No staff with active contracts today', marked: 0 }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

    // Get existing attendance records for today
    const { data: existing } = await supabase
      .from('attendance')
      .select('staff_id')
      .in('staff_id', eligibleStaff.map(s => s.id))
      .eq('date', today)

    const alreadyMarked = new Set((existing || []).map(a => a.staff_id))

    // Only insert for staff with no attendance record today
    const toInsert = eligibleStaff
      .filter(s => !alreadyMarked.has(s.id))
      .map(s => ({
        staff_id: s.id,
        home_id: s.home_id,
        date: today,
        status: 'present',
        marked_by: null,
      }))

    if (!toInsert.length) return new Response(
      JSON.stringify({ message: 'All staff already marked for today', marked: 0 }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

    const { error: insertError } = await supabase
      .from('attendance')
      .insert(toInsert)

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({ message: 'Auto-attendance marked', marked: toInsert.length, date: today }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
