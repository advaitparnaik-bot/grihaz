import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AddStaffModal from './AddStaffModal'
import './AdhocEntryModal.css'

export default function AdhocEntryModal({ homeId, onClose, onAdded }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddStaff, setShowAddStaff] = useState(false)

  const [form, setForm] = useState({
    staff_id: '',
    work_description: '',
    has_payment: null,
    payment_type: '',
    custom_amount: '',
    settlement: '',
    settlement_mode: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [errors, setErrors] = useState({})

  useEffect(() => { loadStaff() }, [])

  async function loadStaff() {
    const { data } = await supabase
      .from('staff')
      .select('id, name, role, pay_type, daily_rate, monthly_rate, staff_type')
      .eq('home_id', homeId)
      .eq('active', true)
      .order('name')
    setStaff(data || [])
    setLoading(false)
  }

  async function handleStaffAdded() {
    // Reload staff list, then auto-select the newest staff member
    const { data } = await supabase
      .from('staff')
      .select('id, name, role, pay_type, daily_rate, monthly_rate, staff_type')
      .eq('home_id', homeId)
      .eq('active', true)
      .order('created_at', { ascending: false })
    const updated = data || []
    setStaff(updated.sort((a, b) => a.name.localeCompare(b.name)))
    // Auto-select the most recently created staff
    if (updated.length > 0) {
      setForm(p => ({ ...p, staff_id: updated[0].id }))
      setErrors(p => ({ ...p, staff_id: undefined }))
    }
    setShowAddStaff(false)
  }

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }))
    setErrors(p => ({ ...p, [field]: undefined }))
  }

  function getContractDayRate(staffMember) {
    if (!staffMember) return null
    if (staffMember.pay_type === 'per_day') return staffMember.daily_rate
    if (staffMember.pay_type === 'fixed_monthly') return staffMember.monthly_rate
      ? Math.round(staffMember.monthly_rate / 26)
      : null
    return null
  }

  const selectedStaff = staff.find(s => s.id === form.staff_id)
  const contractRate = getContractDayRate(selectedStaff)

  function validate() {
    const e = {}
    if (!form.staff_id) e.staff_id = 'Select a staff member'
    if (!form.work_description.trim()) e.work_description = 'Enter work description'
    if (form.has_payment === null) e.has_payment = 'Select payment option'
    if (form.has_payment) {
      if (!form.payment_type) e.payment_type = 'Select payment type'
      if (form.payment_type === 'custom' && !form.custom_amount) e.custom_amount = 'Enter amount'
      if (form.payment_type === 'reimbursement' && !form.custom_amount) e.custom_amount = 'Enter amount'
      if (!form.settlement) e.settlement = 'Select settlement'
      if (form.settlement === 'now' && !form.settlement_mode) e.settlement_mode = 'Select mode'
    }
    if (!form.date) e.date = 'Select date'
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      let amount = null
      let type = 'no_payment'

      if (form.has_payment) {
        type = form.payment_type
        if (form.payment_type === 'contract') {
          amount = contractRate
        } else {
          amount = parseFloat(form.custom_amount)
        }
      }

      const { error } = await supabase.from('adhoc_entries').insert([{
        staff_id: form.staff_id,
        home_id: homeId,
        date: form.date,
        description: form.work_description.trim(),
        amount,
        type,
        settlement: form.has_payment ? form.settlement : null,
        settlement_mode: form.settlement === 'now' ? form.settlement_mode : null,
        settled: form.settlement === 'now',
        created_by: user.id,
      }])

      if (error) throw error
      onAdded()
    } catch (err) {
      console.error('Adhoc entry error:', err)
      alert('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  // Show AddStaffModal on top
  if (showAddStaff) {
    return (
      <AddStaffModal
        homeId={homeId}
        onClose={() => setShowAddStaff(false)}
        onAdded={handleStaffAdded}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <h3>Adhoc Entry</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Date */}
          <div className="form-field">
            <label>Date <span className="req">*</span></label>
            <input type="date" value={form.date}
              onChange={e => set('date', e.target.value)}
              className={errors.date ? 'input-error' : ''} />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>

          {/* Staff picker */}
          <div className="form-field">
            <label>Staff <span className="req">*</span></label>
            {loading ? <p className="adhoc-loading">Loading staff…</p> : (
              <div className="adhoc-staff-list">
                {staff.map(s => (
                  <button key={s.id} type="button"
                    className={`adhoc-staff-btn ${form.staff_id === s.id ? 'adhoc-staff-btn--active' : ''}`}
                    onClick={() => set('staff_id', s.id)}>
                    <span className="adhoc-staff-name">{s.name}</span>
                    <span className="adhoc-staff-role">{s.role || (s.staff_type === 'adhoc' ? 'Adhoc' : '—')}</span>
                  </button>
                ))}
                {/* Add new staff option */}
                <button type="button"
                  className="adhoc-staff-btn adhoc-staff-btn--add"
                  onClick={() => setShowAddStaff(true)}>
                  <span className="adhoc-staff-name">+ Add New Staff</span>
                  <span className="adhoc-staff-role">Create a new staff member</span>
                </button>
              </div>
            )}
            {errors.staff_id && <span className="field-error">{errors.staff_id}</span>}
          </div>

          {/* Work description */}
          <div className="form-field">
            <label>Type of Work <span className="req">*</span></label>
            <input type="text" placeholder="e.g. Cleaned balcony windows, Extra cooking day"
              value={form.work_description}
              onChange={e => set('work_description', e.target.value)}
              className={errors.work_description ? 'input-error' : ''} />
            {errors.work_description && <span className="field-error">{errors.work_description}</span>}
          </div>

          {/* Payment Y/N */}
          <div className="form-field">
            <label>Payment <span className="req">*</span></label>
            <div className="adhoc-toggle-row">
              <button type="button"
                className={`adhoc-toggle-btn ${form.has_payment === true ? 'adhoc-toggle-btn--active' : ''}`}
                onClick={() => set('has_payment', true)}>Yes</button>
              <button type="button"
                className={`adhoc-toggle-btn ${form.has_payment === false ? 'adhoc-toggle-btn--active' : ''}`}
                onClick={() => { set('has_payment', false); setForm(p => ({ ...p, payment_type: '', custom_amount: '', settlement: '', settlement_mode: '' })) }}>No</button>
            </div>
            {errors.has_payment && <span className="field-error">{errors.has_payment}</span>}
          </div>

          {/* Payment type */}
          {form.has_payment === true && (
            <>
              <div className="form-field">
                <label>Payment Type <span className="req">*</span></label>
                <div className="pay-type-options">
                  <button type="button"
                    className={`pay-type-btn ${form.payment_type === 'contract' ? 'pay-type-btn--active' : ''}`}
                    onClick={() => set('payment_type', 'contract')}
                    disabled={!contractRate}>
                    <span className="pt-label">Contract Rate</span>
                    <span className="pt-hint">
                      {contractRate ? `₹${contractRate?.toLocaleString('en-IN')} per day` : 'No rate on file (per visit staff)'}
                    </span>
                  </button>
                  <button type="button"
                    className={`pay-type-btn ${form.payment_type === 'custom' ? 'pay-type-btn--active' : ''}`}
                    onClick={() => set('payment_type', 'custom')}>
                    <span className="pt-label">Custom Amount</span>
                    <span className="pt-hint">Enter a specific amount for this work</span>
                  </button>
                  <button type="button"
                    className={`pay-type-btn ${form.payment_type === 'reimbursement' ? 'pay-type-btn--active' : ''}`}
                    onClick={() => set('payment_type', 'reimbursement')}>
                    <span className="pt-label">Reimbursement</span>
                    <span className="pt-hint">Staff paid for something on your behalf</span>
                  </button>
                </div>
                {errors.payment_type && <span className="field-error">{errors.payment_type}</span>}
              </div>

              {(form.payment_type === 'custom' || form.payment_type === 'reimbursement') && (
                <div className="form-field">
                  <label>Amount (₹) <span className="req">*</span></label>
                  <input type="number" min="0" placeholder="e.g. 500"
                    value={form.custom_amount}
                    onChange={e => set('custom_amount', e.target.value)}
                    className={errors.custom_amount ? 'input-error' : ''} />
                  {errors.custom_amount && <span className="field-error">{errors.custom_amount}</span>}
                </div>
              )}

              {form.payment_type === 'contract' && contractRate && (
                <div className="adhoc-rate-preview">
                  Amount: <strong>₹{contractRate?.toLocaleString('en-IN')}</strong>
                </div>
              )}

              {form.payment_type && (
                <div className="form-field">
                  <label>Settlement <span className="req">*</span></label>
                  <div className="adhoc-toggle-row">
                    <button type="button"
                      className={`adhoc-toggle-btn ${form.settlement === 'now' ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => set('settlement', 'now')}>Settle Now</button>
                    <button type="button"
                      className={`adhoc-toggle-btn ${form.settlement === 'salary_cycle' ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => { set('settlement', 'salary_cycle'); set('settlement_mode', '') }}>Salary Cycle</button>
                  </div>
                  {errors.settlement && <span className="field-error">{errors.settlement}</span>}
                </div>
              )}

              {form.settlement === 'now' && (
                <div className="form-field">
                  <label>Mode <span className="req">*</span></label>
                  <div className="adhoc-toggle-row">
                    <button type="button"
                      className={`adhoc-toggle-btn ${form.settlement_mode === 'cash' ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => set('settlement_mode', 'cash')}>Cash</button>
                    <button type="button"
                      className={`adhoc-toggle-btn ${form.settlement_mode === 'upi' ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => set('settlement_mode', 'upi')}>UPI</button>
                  </div>
                  {errors.settlement_mode && <span className="field-error">{errors.settlement_mode}</span>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
