import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AttendanceRow from './AttendanceRow'
import AdhocEntryModal from './AdhocEntryModal'
import './Dashboard.css'
import AttendanceCalendar from './AttendanceCalendar'
import Laundry from './Laundry'

export default function Dashboard({ onNavigate }) {
  const [home, setHome] = useState(null)
  const [staff, setStaff] = useState([])
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showAdhoc, setShowAdhoc] = useState(false)

  const [showCalendar, setShowCalendar] = useState(false)
  const [showLaundry, setShowLaundry] = useState(false)
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const displayDate = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: memberData } = await supabase
        .from('home_members').select('home_id, homes(id, name)')
        .eq('user_id', user.id).limit(1).single()
      if (!memberData) { setLoading(false); return }
      const homeData = memberData.homes
      setHome(homeData)

      const { data: staffData } = await supabase
        .from('staff').select('*')
        .eq('home_id', homeData.id).eq('active', true)
        .eq('staff_type', 'regular')
        .order('created_at', { ascending: true })
      setStaff(staffData || [])

      if (staffData?.length) {
        const { data: attData } = await supabase
          .from('attendance').select('staff_id, status')
          .eq('home_id', homeData.id).eq('date', todayStr)
          .in('staff_id', staffData.map(s => s.id))
        const attMap = {}
        attData?.forEach(a => { attMap[a.staff_id] = a.status })
        setAttendance(attMap)
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  function handleStatusChange(staffId, status) {
    setAttendance(prev => ({ ...prev, [staffId]: status }))
  }

  async function saveAttendance() {
    if (!home) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const upserts = Object.entries(attendance).map(([staffId, status]) => ({
        staff_id: staffId, home_id: home.id, date: todayStr, status, marked_by: user.id
      }))
      if (!upserts.length) { setSaving(false); return }
      const { error } = await supabase.from('attendance')
        .upsert(upserts, { onConflict: 'staff_id,date', ignoreDuplicates: false })
      if (error) throw error
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error(err)
      alert('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  const todayFull = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const todayShort = today.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()

  function isScheduledToday(s) {
    if (!s.schedule) return true
    if (Array.isArray(s.schedule))
      return s.schedule.some(d => d.toLowerCase() === todayFull || d.toLowerCase() === todayShort)
    return true
  }

  const scheduledStaff = staff.filter(isScheduledToday)
  const unscheduledStaff = staff.filter(s => !isScheduledToday(s))
  const markedCount = scheduledStaff.filter(s => attendance[s.id]).length

  if (loading) return (
    <div className="dash-loading"><div className="dash-spinner" /><span>Loading…</span></div>
  )

  if (!home) return (
    <div className="dash-no-home">
      <p>No home found.</p>
    </div>
  )

  if (showLaundry) {
  return <Laundry home={home} onClose={() => setShowLaundry(false)} />
  }

  return (
    <div className="dash-root">
      <main className="dash-main">
        <div className="dash-date-row">
          <span className="dash-date-text">{displayDate}</span>
          <div className="dash-date-right">
            <button className="dash-calendar-btn" onClick={() => setShowCalendar(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            <span className="dash-count-badge">{markedCount} / {scheduledStaff.length}</span>
          </div>
        </div>

        <section className="dash-section">
          <div className="dash-section-head">
            <h2>Attendance</h2>
            {scheduledStaff.length > 0 && (
              <button className={`btn-save ${saveSuccess ? 'btn-save--done' : ''}`}
                onClick={saveAttendance} disabled={saving || markedCount === 0}>
                {saving ? 'Saving…' : saveSuccess ? '✓ Saved' : 'Save'}
              </button>
            )}
          </div>

          {staff.length === 0 ? (
            <div className="dash-empty-state">
              <div className="dash-empty-icon">🏠</div>
              <p>No staff added yet.</p>
              <p className="dash-empty-hint">Go to the Staff tab to add staff.</p>
            </div>
          ) : scheduledStaff.length === 0 ? (
            <div className="dash-empty-state">
              <p>No staff scheduled for today.</p>
            </div>
          ) : (
            <div className="staff-list">
              {scheduledStaff.map(s => (
                <AttendanceRow key={s.id} staff={s}
                  status={attendance[s.id] || null} onChange={handleStatusChange} />
              ))}
            </div>
          )}

          {unscheduledStaff.length > 0 && (
            <details className="dash-offday-group">
              <summary>Not scheduled today ({unscheduledStaff.length})</summary>
              <div className="staff-list staff-list--muted">
                {unscheduledStaff.map(s => (
                  <AttendanceRow key={s.id} staff={s}
                    status={attendance[s.id] || null} onChange={handleStatusChange} dimmed />
                ))}
              </div>
            </details>
          )}
        </section>

        <button className="dash-laundry-btn" onClick={() => setShowLaundry(true)}>
          🧺 Laundry
        </button>
          

        <button className="dash-adhoc-btn" onClick={() => setShowAdhoc(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Adhoc Entry
        </button>
      </main>

      {showAdhoc && (
        <AdhocEntryModal
          homeId={home.id}
          onClose={() => setShowAdhoc(false)}
          onAdded={() => setShowAdhoc(false)}
        />
      )}
      {showCalendar && (
        <AttendanceCalendar
          home={home}
          staff={staff}
          onClose={() => setShowCalendar(false)}
        />
      )}
      
    </div>
  )
}
