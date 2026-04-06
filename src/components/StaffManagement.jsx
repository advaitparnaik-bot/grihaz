import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AddStaffModal from './AddStaffModal'
import './StaffManagement.css'

const PAY_TYPE_LABELS = {
  fixed_monthly: 'Fixed Monthly',
  per_day: 'Per Day Rate',
  per_visit: 'Per Visit',
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatSchedule(schedule) {
  if (!schedule || !schedule.length) return 'No fixed schedule'
  return schedule.map(d => d.slice(0, 3).charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')
}

function formatRate(staff) {
  if (staff.pay_type === 'fixed_monthly') return `₹${staff.monthly_rate?.toLocaleString('en-IN')}/mo`
  if (staff.pay_type === 'per_day') return `₹${staff.daily_rate?.toLocaleString('en-IN')}/day`
  return 'Per visit'
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const PAY_TYPES = [
  { value: 'fixed_monthly', label: 'Fixed Monthly', hint: 'Fixed salary, deduct for absent-unpaid days' },
  { value: 'per_day',       label: 'Per Day Rate',  hint: 'Paid only for days present' },
  { value: 'per_visit',     label: 'Per Visit',     hint: 'Each visit logged manually' },
]

export default function StaffManagement() {
  const [staff, setStaff] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [homeId, setHomeId] = useState(null)
  const [showAddStaff, setShowAddStaff] = useState(false)

  const [editStaff, setEditStaff] = useState(null)
  const [editForm, setEditForm] = useState({ pay_type: 'fixed_monthly', monthly_rate: '', daily_rate: '', schedule: [], effective_from: '' })
  const [editErrors, setEditErrors] = useState({})

  const [terminateStaff, setTerminateStaff] = useState(null)
  const [terminateDate, setTerminateDate] = useState('')
  const [terminateError, setTerminateError] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => { loadStaff() }, [filter])

  async function loadStaff() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: memberData } = await supabase
        .from('home_members').select('home_id').eq('user_id', user.id).single()
      if (!memberData) { setLoading(false); return }
      setHomeId(memberData.home_id)

      let query = supabase.from('staff').select('*')
        .eq('home_id', memberData.home_id).order('created_at', { ascending: true })
      if (filter === 'active') query = query.eq('active', true)
      if (filter === 'inactive') query = query.eq('active', false)

      const { data } = await query
      setStaff(data || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  function openEdit(s) {
    setEditForm({
      pay_type: s.pay_type,
      monthly_rate: s.monthly_rate || '',
      daily_rate: s.daily_rate || '',
      schedule: s.schedule || [],
      effective_from: new Date().toISOString().split('T')[0],
    })
    setEditErrors({})
    setEditStaff(s)
  }

  function toggleEditDay(dayValue) {
    setEditForm(prev => ({
      ...prev,
      schedule: prev.schedule.includes(dayValue)
        ? prev.schedule.filter(d => d !== dayValue)
        : [...prev.schedule, dayValue]
    }))
  }

  async function handleSaveContract() {
    const errors = {}
    if (editForm.pay_type === 'fixed_monthly' && !editForm.monthly_rate) errors.monthly_rate = 'Enter monthly rate'
    if (editForm.pay_type === 'per_day' && !editForm.daily_rate) errors.daily_rate = 'Enter daily rate'
    if (editForm.pay_type !== 'per_visit' && editForm.schedule.length === 0) errors.schedule = 'Select at least one day'
    if (!editForm.effective_from) errors.effective_from = 'Enter effective date'
    if (Object.keys(errors).length) { setEditErrors(errors); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Close current open contract
      await supabase.from('staff_contracts')
        .update({ effective_to: editForm.effective_from })
        .eq('staff_id', editStaff.id)
        .is('effective_to', null)

      // Insert new contract
      await supabase.from('staff_contracts').insert([{
        staff_id: editStaff.id,
        home_id: homeId,
        pay_type: editForm.pay_type,
        monthly_rate: editForm.pay_type === 'fixed_monthly' ? parseFloat(editForm.monthly_rate) : null,
        daily_rate: editForm.pay_type === 'per_day' ? parseFloat(editForm.daily_rate) : null,
        schedule: editForm.pay_type === 'per_visit' ? null : editForm.schedule,
        effective_from: editForm.effective_from,
        effective_to: null,
        created_by: user.id,
      }])

      // Update staff table current values too
      await supabase.from('staff').update({
        pay_type: editForm.pay_type,
        monthly_rate: editForm.pay_type === 'fixed_monthly' ? parseFloat(editForm.monthly_rate) : null,
        daily_rate: editForm.pay_type === 'per_day' ? parseFloat(editForm.daily_rate) : null,
        schedule: editForm.pay_type === 'per_visit' ? null : editForm.schedule,
      }).eq('id', editStaff.id)

      setEditStaff(null)
      loadStaff()
    } catch (err) {
      console.error(err)
      alert('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  function openTerminate(s) {
    setTerminateDate(new Date().toISOString().split('T')[0])
    setTerminateError('')
    setTerminateStaff(s)
  }

  async function handleTerminate() {
    if (!terminateDate) { setTerminateError('Please select a termination date.'); return }
    setSaving(true)
    setTerminateError('')
    try {
      const { data: conflict } = await supabase.from('attendance')
        .select('date').eq('staff_id', terminateStaff.id)
        .eq('status', 'present').gt('date', terminateDate).limit(1)

      if (conflict?.length > 0) {
        const d = new Date(conflict[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        setTerminateError(`${terminateStaff.name} is marked Present on ${d}, which is after the termination date. Please correct attendance first.`)
        setSaving(false)
        return
      }

      await supabase.from('staff').update({
        active: false,
        terminated_at: new Date(terminateDate).toISOString(),
      }).eq('id', terminateStaff.id)

      setTerminateStaff(null)
      loadStaff()
    } catch (err) {
      console.error(err)
      alert('Failed to terminate. Please try again.')
    }
    setSaving(false)
  }

  async function handleReactivate(s) {
    await supabase.from('staff').update({ active: true, terminated_at: null }).eq('id', s.id)
    loadStaff()
  }

  return (
    <div className="sm-root">

      <div className="sm-tabs">
        {['active', 'inactive', 'all'].map(tab => (
          <button key={tab}
            className={`sm-tab ${filter === tab ? 'sm-tab--active' : ''}`}
            onClick={() => setFilter(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <main className="sm-main">
        {loading ? (
          <div className="sm-loading"><div className="dash-spinner" />Loading…</div>
        ) : staff.length === 0 ? (
          <div className="sm-empty"><p>No {filter !== 'all' ? filter : ''} staff found.</p></div>
        ) : (
          <div className="sm-list">
            {staff.map(s => (
              <div key={s.id} className={`sm-card ${!s.active ? 'sm-card--inactive' : ''}`}>
                <div className="sm-card-top">
                  <div className="sm-avatar">{initials(s.name)}</div>
                  <div className="sm-info">
                    <div className="sm-name">{s.name}</div>
                    <div className="sm-role">{s.role || '—'}</div>
                  </div>
                  {!s.active && <span className="sm-badge sm-badge--terminated">Terminated</span>}
                </div>

                <div className="sm-meta">
                  <div className="sm-meta-item">
                    <span className="sm-meta-label">Pay</span>
                    <span className="sm-meta-value">{PAY_TYPE_LABELS[s.pay_type]}</span>
                  </div>
                  {s.pay_type !== 'per_visit' && (
                    <div className="sm-meta-item">
                      <span className="sm-meta-label">Rate</span>
                      <span className="sm-meta-value">{formatRate(s)}</span>
                    </div>
                  )}
                  {s.schedule && (
                    <div className="sm-meta-item">
                      <span className="sm-meta-label">Schedule</span>
                      <span className="sm-meta-value">{formatSchedule(s.schedule)}</span>
                    </div>
                  )}
                  {s.terminated_at && (
                    <div className="sm-meta-item">
                      <span className="sm-meta-label">Terminated</span>
                      <span className="sm-meta-value">
                        {new Date(s.terminated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {s.active ? (
                  <div className="sm-actions">
                    <button className="sm-btn sm-btn--edit" onClick={() => openEdit(s)}>Edit Contract</button>
                    <button className="sm-btn sm-btn--terminate" onClick={() => openTerminate(s)}>Terminate</button>
                  </div>
                ) : (
                  <div className="sm-actions">
                    <button className="sm-btn sm-btn--reactivate" onClick={() => handleReactivate(s)}>Reactivate</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Staff FAB */}
      <button className="fab" onClick={() => setShowAddStaff(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Staff
      </button>

      {showAddStaff && (
        <AddStaffModal
          homeId={homeId}
          onClose={() => setShowAddStaff(false)}
          onAdded={() => { setShowAddStaff(false); loadStaff() }}
        />
      )}

      {/* Edit Contract Modal */}
      {editStaff && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditStaff(null)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h3>Edit Contract — {editStaff.name}</h3>
              <button className="modal-close" onClick={() => setEditStaff(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="sm-edit-note">
                A new contract will be created from the effective date. The previous contract applies to all dates before it.
              </div>

              <div className="form-field">
                <label>Pay Structure <span className="req">*</span></label>
                <div className="pay-type-options">
                  {PAY_TYPES.map(pt => (
                    <button key={pt.value} type="button"
                      className={`pay-type-btn ${editForm.pay_type === pt.value ? 'pay-type-btn--active' : ''}`}
                      onClick={() => setEditForm(p => ({ ...p, pay_type: pt.value }))}>
                      <span className="pt-label">{pt.label}</span>
                      <span className="pt-hint">{pt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {editForm.pay_type === 'fixed_monthly' && (
                <div className="form-field">
                  <label>Monthly Rate (₹) <span className="req">*</span></label>
                  <input type="number" min="0" value={editForm.monthly_rate}
                    onChange={e => setEditForm(p => ({ ...p, monthly_rate: e.target.value }))}
                    className={editErrors.monthly_rate ? 'input-error' : ''} />
                  {editErrors.monthly_rate && <span className="field-error">{editErrors.monthly_rate}</span>}
                </div>
              )}

              {editForm.pay_type === 'per_day' && (
                <div className="form-field">
                  <label>Daily Rate (₹) <span className="req">*</span></label>
                  <input type="number" min="0" value={editForm.daily_rate}
                    onChange={e => setEditForm(p => ({ ...p, daily_rate: e.target.value }))}
                    className={editErrors.daily_rate ? 'input-error' : ''} />
                  {editErrors.daily_rate && <span className="field-error">{editErrors.daily_rate}</span>}
                </div>
              )}

              {editForm.pay_type !== 'per_visit' && (
                <div className="form-field">
                  <label>Schedule <span className="req">*</span></label>
                  <div className="day-picker">
                    {DAYS.map((day, i) => (
                      <button key={day} type="button"
                        className={`day-btn ${editForm.schedule.includes(DAY_VALUES[i]) ? 'day-btn--active' : ''}`}
                        onClick={() => toggleEditDay(DAY_VALUES[i])}>
                        {day}
                      </button>
                    ))}
                  </div>
                  {editErrors.schedule && <span className="field-error">{editErrors.schedule}</span>}
                </div>
              )}

              <div className="form-field">
                <label>Effective From <span className="req">*</span></label>
                <input type="date" value={editForm.effective_from}
                  onChange={e => setEditForm(p => ({ ...p, effective_from: e.target.value }))}
                  className={editErrors.effective_from ? 'input-error' : ''} />
                {editErrors.effective_from && <span className="field-error">{editErrors.effective_from}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setEditStaff(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveContract} disabled={saving}>
                {saving ? 'Saving…' : 'Save Contract'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminate Modal */}
      {terminateStaff && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTerminateStaff(null)}>
          <div className="modal-sheet modal-sheet--confirm">
            <div className="modal-header">
              <h3>Terminate — {terminateStaff.name}</h3>
              <button className="modal-close" onClick={() => setTerminateStaff(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Last Working Date <span className="req">*</span></label>
                <input type="date" value={terminateDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => { setTerminateDate(e.target.value); setTerminateError('') }} />
              </div>
              {terminateError && <div className="sm-terminate-error">{terminateError}</div>}
              <p className="sm-confirm-text">
                This staff member will be removed from daily attendance. Their records are retained for 12 months.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setTerminateStaff(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleTerminate} disabled={saving}>
                {saving ? 'Checking…' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
