import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './AttendanceCalendarDaySheet.css'

const STATUS_OPTIONS = [
  { value: 'present', label: 'P', title: 'Present' },
  { value: 'absent_paid', label: 'A', title: 'Absent Paid' },
  { value: 'absent_unpaid', label: 'U', title: 'Absent Unpaid' },
]

function getScheduledStaff(staff, dateObj) {
  const fullDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const shortDay = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  return staff.filter(s => {
    if (!s.schedule) return true
    if (Array.isArray(s.schedule))
      return s.schedule.some(d => d.toLowerCase() === fullDay || d.toLowerCase() === shortDay)
    return true
  }).filter(s => s.active && s.staff_type === 'regular')
}

export default function AttendanceCalendarDaySheet({ home, staff, date, settledStaffIds, onClose, onSaved }) {
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dateStr = date.toISOString().split('T')[0]
  const displayDate = date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const scheduledStaff = getScheduledStaff(staff, date)

  useEffect(() => {
    loadAttendance()
  }, [date])

  async function loadAttendance() {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('staff_id, status')
      .eq('home_id', home.id)
      .eq('date', dateStr)
    const attMap = {}
    data?.forEach(a => { attMap[a.staff_id] = a.status })
    setAttendance(attMap)
    setLoading(false)
  }

  function handleStatusChange(staffId, status) {
    setAttendance(prev => ({ ...prev, [staffId]: status }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const upserts = Object.entries(attendance)
        .filter(([staffId]) => !settledStaffIds.includes(staffId)) // ← only unsettled staff
        .map(([staffId, status]) => ({
          staff_id: staffId,
          home_id: home.id,
          date: dateStr,
          status,
          marked_by: user.id,
        }))
      if (upserts.length) {
        await supabase.from('attendance')
          .upsert(upserts, { onConflict: 'staff_id,date', ignoreDuplicates: false })
      }
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Failed to save.')
    }
    setSaving(false)
  }

  const hasEditable = scheduledStaff.some(s => !settledStaffIds.includes(s.id))

  return (
    <div className="acds-overlay">
      <div className="acds-sheet">
        <div className="acds-header">
          <span className="acds-date">{displayDate}</span>
          <button className="acds-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="acds-loading"><div className="dash-spinner" /></div>
        ) : scheduledStaff.length === 0 ? (
          <div className="acds-empty">No staff scheduled for this day.</div>
        ) : (
          <div className="acds-list">
            {scheduledStaff.map(s => {
              const isSettled = settledStaffIds.includes(s.id)
              const status = attendance[s.id] || null
              return (
                <div key={s.id} className="acds-row">
                  <div className="acds-staff-name">{s.name}</div>
                  {isSettled ? (
                    <div className="acds-settled-row">
                      <span className="acds-status-label">{status || '—'}</span>
                      <span className="acds-settled-badge">Settled</span>
                    </div>
                  ) : (
                    <div className="acds-status-btns">
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          className={`acds-status-btn acds-status-btn--${opt.value} ${status === opt.value ? 'acds-status-btn--active' : ''}`}
                          onClick={() => handleStatusChange(s.id, opt.value)}
                          title={opt.title}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {hasEditable && (
          <div className="acds-footer">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}