import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './AddStaffModal.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const PAY_TYPES = [
  { value: 'fixed_monthly', label: 'Fixed Monthly', hint: 'Fixed salary, deduct for absent-unpaid days' },
  { value: 'per_day',       label: 'Per Day Rate',  hint: 'Paid only for days present' },
  { value: 'per_visit',     label: 'Per Visit',     hint: 'Each visit logged manually' },
]

export default function AddStaffModal({ homeId, onClose, onAdded }) {
  const [staffType, setStaffType] = useState('regular') // 'regular' | 'adhoc'
  const [form, setForm] = useState({
    name: '', role: '', pay_type: 'fixed_monthly',
    monthly_rate: '', daily_rate: '', schedule: [],
    effective_from: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function toggleDay(dayValue) {
    setForm(prev => ({
      ...prev,
      schedule: prev.schedule.includes(dayValue)
        ? prev.schedule.filter(d => d !== dayValue)
        : [...prev.schedule, dayValue]
    }))
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (staffType === 'regular') {
      if (form.pay_type === 'fixed_monthly' && !form.monthly_rate) e.monthly_rate = 'Enter monthly rate'
      if (form.pay_type === 'per_day' && !form.daily_rate) e.daily_rate = 'Enter daily rate'
      if (form.pay_type !== 'per_visit' && form.schedule.length === 0) e.schedule = 'Select at least one day'
      if (!form.effective_from) e.effective_from = 'Enter start date'
    }
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const staffPayload = {
        home_id: homeId,
        name: form.name.trim(),
        role: form.role.trim() || null,
        active: true,
        staff_type: staffType,
        ...(staffType === 'regular' ? {
          pay_type: form.pay_type,
          monthly_rate: form.pay_type === 'fixed_monthly' ? parseFloat(form.monthly_rate) : null,
          daily_rate: form.pay_type === 'per_day' ? parseFloat(form.daily_rate) : null,
          schedule: form.pay_type === 'per_visit' ? null : form.schedule,
        } : {
          pay_type: null,
          monthly_rate: null,
          daily_rate: null,
          schedule: null,
        })
      }

      const { data: staffData, error: staffError } = await supabase
        .from('staff').insert([staffPayload]).select().single()
      if (staffError) throw staffError

      // Only create contract for regular staff
      if (staffType === 'regular') {
        await supabase.from('staff_contracts').insert([{
          staff_id: staffData.id,
          home_id: homeId,
          pay_type: form.pay_type,
          monthly_rate: form.pay_type === 'fixed_monthly' ? parseFloat(form.monthly_rate) : null,
          daily_rate: form.pay_type === 'per_day' ? parseFloat(form.daily_rate) : null,
          schedule: form.pay_type === 'per_visit' ? null : form.schedule,
          effective_from: form.effective_from,
          effective_to: null,
          created_by: user.id,
        }])
      }

      onAdded()
    } catch (err) {
      console.error('Add staff error:', err)
      alert('Failed to add staff. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h3>Add Staff</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Staff type toggle */}
          <div className="form-field">
            <label>Staff Type <span className="req">*</span></label>
            <div className="pay-type-options">
              <button type="button"
                className={`pay-type-btn ${staffType === 'regular' ? 'pay-type-btn--active' : ''}`}
                onClick={() => setStaffType('regular')}>
                <span className="pt-label">Regular Staff</span>
                <span className="pt-hint">Has a schedule, rate and pay structure</span>
              </button>
              <button type="button"
                className={`pay-type-btn ${staffType === 'adhoc' ? 'pay-type-btn--active' : ''}`}
                onClick={() => setStaffType('adhoc')}>
                <span className="pt-label">Adhoc Contact</span>
                <span className="pt-hint">One-off or irregular worker, no fixed rate</span>
              </button>
            </div>
          </div>

          <div className="form-field">
            <label>Name <span className="req">*</span></label>
            <input type="text" placeholder="e.g. Meena, Ramesh Kumar"
              value={form.name} onChange={e => set('name', e.target.value)}
              className={errors.name ? 'input-error' : ''} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label>Role</label>
            <input type="text" placeholder="e.g. Maid, Cook, Driver, Plumber"
              value={form.role} onChange={e => set('role', e.target.value)} />
          </div>

          {staffType === 'regular' && (
            <>
              <div className="form-field">
                <label>Pay Structure <span className="req">*</span></label>
                <div className="pay-type-options">
                  {PAY_TYPES.map(pt => (
                    <button key={pt.value} type="button"
                      className={`pay-type-btn ${form.pay_type === pt.value ? 'pay-type-btn--active' : ''}`}
                      onClick={() => set('pay_type', pt.value)}>
                      <span className="pt-label">{pt.label}</span>
                      <span className="pt-hint">{pt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.pay_type === 'fixed_monthly' && (
                <div className="form-field">
                  <label>Monthly Rate (₹) <span className="req">*</span></label>
                  <input type="number" placeholder="e.g. 4500" min="0"
                    value={form.monthly_rate} onChange={e => set('monthly_rate', e.target.value)}
                    className={errors.monthly_rate ? 'input-error' : ''} />
                  {errors.monthly_rate && <span className="field-error">{errors.monthly_rate}</span>}
                </div>
              )}

              {form.pay_type === 'per_day' && (
                <div className="form-field">
                  <label>Daily Rate (₹) <span className="req">*</span></label>
                  <input type="number" placeholder="e.g. 200" min="0"
                    value={form.daily_rate} onChange={e => set('daily_rate', e.target.value)}
                    className={errors.daily_rate ? 'input-error' : ''} />
                  {errors.daily_rate && <span className="field-error">{errors.daily_rate}</span>}
                </div>
              )}

              {form.pay_type !== 'per_visit' && (
                <div className="form-field">
                  <label>Schedule <span className="req">*</span></label>
                  <div className="day-picker">
                    {DAYS.map((day, i) => (
                      <button key={day} type="button"
                        className={`day-btn ${form.schedule.includes(DAY_VALUES[i]) ? 'day-btn--active' : ''}`}
                        onClick={() => toggleDay(DAY_VALUES[i])}>
                        {day}
                      </button>
                    ))}
                  </div>
                  {errors.schedule && <span className="field-error">{errors.schedule}</span>}
                </div>
              )}

              <div className="form-field">
                <label>Start Date <span className="req">*</span></label>
                <input type="date" value={form.effective_from}
                  onChange={e => set('effective_from', e.target.value)}
                  className={errors.effective_from ? 'input-error' : ''} />
                {errors.effective_from && <span className="field-error">{errors.effective_from}</span>}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Adding…' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  )
}
