import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AttendanceRow from './AttendanceRow'
import AdhocEntryModal from './AdhocEntryModal'
import './Dashboard.css'

export default function Dashboard() {
  const [home, setHome] = useState(null)
  const [staff, setStaff] = useState([])
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showAdhoc, setShowAdhoc] = useState(false)

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

  async function handleSignOut() { await supabase.auth.signOut() }

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
      <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
    </div>
  )

  return (
    <div className="dash-root">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div className="dash-brand">
            <span className="dash-logo-glyph">गृ</span>
            <span className="dash-wordmark">grihaz</span>
          </div>
          <div className="dash-home-chip">{home.name}</div>
          <button className="dash-signout-btn" onClick={handleSignOut} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-date-row">
          <span className="dash-date-text">{displayDate}</span>
          <span className="dash-count-badge">{markedCount} / {scheduledStaff.length}</span>
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

        {/* Adhoc entry button */}
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
    </div>
  )
}
