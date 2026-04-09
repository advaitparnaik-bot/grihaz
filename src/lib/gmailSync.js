import { supabase } from './supabase'

export async function runHistorySync(homeId, onProgress) {
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user.id

  let pageToken = null
  let totalSaved = 0
  let totalSkipped = 0
  let page = 0

  do {
    page++
    const body = {
      action: 'sync-history',
      home_id: homeId,
      user_id: userId,
      ...(pageToken && { page_token: pageToken }),
    }

    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      }
    )

    const data = await res.json()
    totalSaved += data.new_orders || 0
    totalSkipped += data.skipped || 0
    pageToken = data.next_page_token

    if (onProgress) onProgress({ page, totalSaved, totalSkipped, done: data.done })

  } while (pageToken)

  return { totalSaved, totalSkipped, pages: page }
}

export async function runDailySync(homeId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'sync',
        home_id: homeId,
        user_id: user.id,
      }),
    }
  )

  return res.json()
}