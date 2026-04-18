import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Settlement.css'
import { runDailySync } from '../lib/gmailSync'

function getMonthOptions() {
  const options = []
  const today = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
    options.push({
      value: val,
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    })
  }
  return options
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// Count actual occurrences of scheduled days in a specific month
// e.g. Jitender (Thursday only) — March 2026 has 4 Thursdays, April has 5
function getScheduledDaysInMonth(schedule, year, month) {
  if (!schedule || schedule.length === 0) {
    return getDaysInMonth(year, month)
  }
  const dayNameToIndex = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  }
  const scheduledIndices = new Set(
    schedule
      .map(d => dayNameToIndex[d.toLowerCase()])
      .filter(d => d !== undefined)
  )
  const daysInMonth = getDaysInMonth(year, month)
  let count = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dayOfWeek = new Date(year, month, day).getDay()
    if (scheduledIndices.has(dayOfWeek)) count++
  }
  return count
}

// Pay only for days earned — unmarked days are ignored entirely
// payPerDay = monthly_rate / scheduledDaysInMonth (respects actual schedule for that month)
// payout = payPerDay × (present + absentPaid) + adhocTotal
function calcPayout(contract, presentDays, absentPaidDays, adhocTotal, year, month) {
  if (!contract) return adhocTotal || 0

  if (contract.pay_type === 'per_day') {
    return (presentDays * (contract.daily_rate || 0)) + (adhocTotal || 0)
  }

  if (contract.pay_type === 'fixed_monthly') {
    const scheduledDaysInMonth = getScheduledDaysInMonth(contract.schedule, year, month)
    const payPerDay = (contract.monthly_rate || 0) / scheduledDaysInMonth
    return Math.round(payPerDay * (presentDays + absentPaidDays)) + (adhocTotal || 0)
  }

  return adhocTotal || 0
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Settlement() {
  const MONTH_OPTIONS = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value)
  const [homeId, setHomeId] = useState(null)
  const [staffSummaries, setStaffSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState(null)
  const [settleForm, setSettleForm] = useState({ amount: '', mode: 'cash' })
  const [saving, setSaving] = useState(false)
  const [expenseTotal, setExpenseTotal] = useState({ total: 0, byCategory: {} })
  const [laundryData, setLaundryData] = useState({ transactions: [], total: 0, settlement: null })
  const [settlingLaundry, setSettlingLaundry] = useState(false)
  const [laundrySettleForm, setLaundrySettleForm] = useState({ amount: '', mode: 'cash' })

  useEffect(() => { if (homeId) { loadSummaries(); loadExpenses(); loadLaundry() } }, [homeId, selectedMonth])
  useEffect(() => { loadHome() }, [])

  async function loadHome() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('home_members').select('home_id').eq('user_id', user.id).single()
    if (data) setHomeId(data.home_id)
  }

  async function loadSummaries() {
    setLoading(true)
    try {
      const monthDate = new Date(selectedMonth)
      const year = monthDate.getFullYear()
      const month = monthDate.getMonth()
      const firstDay = selectedMonth
      const lastDayDate = new Date(year, month + 1, 0)
      const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth()+1).padStart(2,'0')}-${String(lastDayDate.getDate()).padStart(2,'0')}`

      // Active regular staff
      const { data: staffData } = await supabase.from('staff')
        .select('*').eq('home_id', homeId).eq('active', true).eq('staff_type', 'regular')

      if (!staffData?.length) { setStaffSummaries([]); setLoading(false); return }

      // Contracts active during month
      const { data: contracts } = await supabase.from('staff_contracts')
        .select('*').eq('home_id', homeId)
        .lte('effective_from', lastDay)
        .or(`effective_to.is.null,effective_to.gte.${firstDay}`)

      // Attendance for month
      const { data: attendance } = await supabase.from('attendance')
        .select('staff_id, status, date').eq('home_id', homeId)
        .gte('date', firstDay).lte('date', lastDay)

      // Adhoc entries on salary cycle for month
      const { data: adhoc } = await supabase.from('adhoc_entries')
        .select('staff_id, amount, type, settled').eq('home_id', homeId)
        .gte('date', firstDay).lte('date', lastDay)
        .eq('settlement', 'salary_cycle')

      // Existing settlements
      const { data: settlements } = await supabase.from('settlements')
        .select('*').eq('home_id', homeId).eq('month', firstDay)

      const summaries = staffData.map(staff => {
        const contract = contracts?.find(c => c.staff_id === staff.id) || null
        const staffAtt = attendance?.filter(a => a.staff_id === staff.id) || []

        const presentDays = staffAtt.filter(a => a.status === 'present').length

        const absentPaidEntries = staffAtt.filter(a => a.status === 'absent_paid')
        const absentPaidDays = absentPaidEntries.length
        const absentPaidDates = absentPaidEntries.map(a => formatDate(a.date))

        const absentUnpaidEntries = staffAtt.filter(a => a.status === 'absent_unpaid')
        const absentUnpaidDays = absentUnpaidEntries.length
        const absentUnpaidDates = absentUnpaidEntries.map(a => formatDate(a.date))

        const staffAdhoc = adhoc?.filter(a => a.staff_id === staff.id) || []
        const adhocTotal = staffAdhoc.reduce((sum, a) => sum + (a.amount || 0), 0)

        const payout = calcPayout(contract, presentDays, absentPaidDays, adhocTotal, year, month)
        const settlement = settlements?.find(s => s.staff_id === staff.id)

        return {
          staff,
          contract,
          presentDays,
          absentPaidDays,
          absentPaidDates,
          absentUnpaidDays,
          absentUnpaidDates,
          adhocTotal,
          payout: Math.round(payout),
          settlement: settlement || null,
          settled: !!settlement,
        }
      })

      setStaffSummaries(summaries)
    } catch (err) { console.error(err) }
    setLoading(false)
  }
async function loadExpenses() {
  const monthDate = new Date(selectedMonth)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = selectedMonth
  const lastDayDate = new Date(year, month + 1, 0)
  const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth()+1).padStart(2,'0')}-${String(lastDayDate.getDate()).padStart(2,'0')}`

  const { data } = await supabase
    .from('expense_orders')
    .select('category, order_total')
    .eq('home_id', homeId)
    .gte('order_date', firstDay)
    .lte('order_date', lastDay)

  if (!data) return
  let total = 0
  const byCategory = {}
  for (const order of data) {
    const amt = Number(order.order_total) || 0
    total += amt
    byCategory[order.category] = (byCategory[order.category] || 0) + amt
  }
  setExpenseTotal({ total, byCategory })
}

async function loadLaundry() {
  const monthDate = new Date(selectedMonth)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = selectedMonth
  const lastDayDate = new Date(year, month + 1, 0)
  const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth()+1).padStart(2,'0')}-${String(lastDayDate.getDate()).padStart(2,'0')}`

  const { data: transactions } = await supabase
    .from('laundry_transactions')
    .select('*, laundry_transaction_items(*)')
    .eq('home_id', homeId)
    .eq('status', 'closed')
    .gte('closed_at', firstDay)
    .lte('closed_at', lastDay + 'T23:59:59')
    .order('closed_at', { ascending: true })

  const total = (transactions || []).reduce((sum, t) => {
    const tTotal = (t.laundry_transaction_items || []).reduce(
      (s, i) => s + (i.unit_price * i.quantity_given), 0
    )
    return sum + tTotal
  }, 0)

  const { data: settlement } = await supabase
    .from('laundry_settlements')
    .select('*')
    .eq('home_id', homeId)
    .eq('month', firstDay)
    .maybeSingle()

  setLaundryData({ transactions: transactions || [], total, settlement: settlement || null })
}

  function openSettle(summary) {
    setSettleForm({ amount: summary.payout.toString(), mode: 'cash' })
    setSettling(summary.staff.id)
  }

  async function handleSettle() {
    if (!settleForm.amount || !settleForm.mode) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('settlements').insert([{
        staff_id: settling,
        home_id: homeId,
        month: selectedMonth,
        amount: parseFloat(settleForm.amount),
        mode: settleForm.mode,
        settled_at: new Date().toISOString(),
        settled_by: user.id,
        created_by: user.id,
      }])
      if (error) throw error
      setSettling(null)
      loadSummaries()
    } catch (err) {
      console.error(err)
      alert('Failed to settle. Please try again.')
    }
    setSaving(false)
  }

  async function handleLaundrySettle() {
    if (!laundrySettleForm.amount || !laundrySettleForm.mode) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('laundry_settlements').insert([{
        home_id: homeId,
        month: selectedMonth,
        amount_paid: parseFloat(laundrySettleForm.amount),
        payment_mode: laundrySettleForm.mode,
        paid_at: new Date().toISOString(),
        paid_by: user.id,
      }])
      if (error) throw error
      setSettlingLaundry(false)
      loadLaundry()
    } catch (err) {
      console.error(err)
      alert('Failed to settle. Please try again.')
    }
    setSaving(false)
  }

  const totalOutstanding = staffSummaries.filter(s => !s.settled).reduce((sum, s) => sum + s.payout, 0)
  const totalSettled = staffSummaries.filter(s => s.settled).reduce((sum, s) => sum + (s.settlement?.amount || 0), 0)

  const CATEGORY_LABELS = {
    grocery: 'Grocery',
    shopping: 'Shopping',
    restaurant: 'Restaurant',
    fashion_apparel: 'Fashion & Apparel',
  }

  return (
    <div className="set-root">

      {/* Month picker */}
      <div className="set-month-row">
        {MONTH_OPTIONS.map(o => (
          <button key={o.value}
            className={`set-month-btn ${selectedMonth === o.value ? 'set-month-btn--active' : ''}`}
            onClick={() => setSelectedMonth(o.value)}>
            {o.label}
          </button>
        ))}
      </div>

    {/* Household Spends */}
    <div className="set-spends">
      <div className="set-spends-header">
        <span className="set-spends-title">Household Spends</span>
        <span className="set-spends-total">₹{Math.round(expenseTotal.total).toLocaleString('en-IN')}</span>
      </div>
      {expenseTotal.total > 0 && (
        <div className="set-spends-breakdown">
          {Object.entries(expenseTotal.byCategory).map(([category, amt]) => (
            <div key={category} className="set-spends-row">
              <span>{CATEGORY_LABELS[category] || category}</span>
              <span>₹{Math.round(amt).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}
    </div>

      {/* Totals */}
      <div className="set-totals">
        <div className="set-total-item">
          <span className="set-total-label">Outstanding</span>
          <span className="set-total-value set-total-value--outstanding">₹{totalOutstanding.toLocaleString('en-IN')}</span>
        </div>
        <div className="set-total-divider" />
        <div className="set-total-item">
          <span className="set-total-label">Settled</span>
          <span className="set-total-value set-total-value--settled">₹{totalSettled.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <main className="set-main">
        {laundryData.transactions.length > 0 && (
          <div className={`set-card ${laundryData.settlement ? 'set-card--settled' : ''}`}>
            <div className="set-card-top">
              <div className="sm-avatar">🧺</div>
              <div className="sm-info">
                <div className="sm-name">Laundry</div>
                <div className="sm-role">{laundryData.transactions.length} drop-off{laundryData.transactions.length > 1 ? 's' : ''} returned</div>
              </div>
              {laundryData.settlement ? (
                <span className="set-badge set-badge--settled">Settled</span>
              ) : (
                <span className="set-badge set-badge--outstanding">Outstanding</span>
              )}
            </div>

            <div className="set-breakdown">
              {laundryData.transactions.map(t => {
                const tTotal = (t.laundry_transaction_items || []).reduce(
                  (s, i) => s + (i.unit_price * i.quantity_given), 0
                )
                return (
                  <div key={t.id} className="set-breakdown-item">
                    <span>Returned {new Date(t.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    <span>₹{Math.round(tTotal).toLocaleString('en-IN')}</span>
                  </div>
                )
              })}
              <div className="set-breakdown-item set-breakdown-item--total">
                <span>Total Payable</span>
                <span>₹{Math.round(laundryData.total).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {laundryData.settlement ? (
              <div className="set-settled-info">
                Paid ₹{laundryData.settlement.amount_paid.toLocaleString('en-IN')} via {laundryData.settlement.payment_mode.toUpperCase()}
                {' · '}{new Date(laundryData.settlement.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </div>
            ) : (
              <button className="btn-primary set-settle-btn" 
                onClick={() => { setLaundrySettleForm({ amount: Math.round(laundryData.total).toString(), mode: 'cash' }); setSettlingLaundry(true) }}>
                Settle
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="sm-loading"><div className="dash-spinner" />Loading…</div>
        ) : staffSummaries.length === 0 ? (
          <div className="sm-empty"><p>No active staff found.</p></div>
        ) : (
          <div className="set-list">
            {staffSummaries.map(summary => (
              <div key={summary.staff.id} className={`set-card ${summary.settled ? 'set-card--settled' : ''}`}>
                <div className="set-card-top">
                  <div className="sm-avatar">{initials(summary.staff.name)}</div>
                  <div className="sm-info">
                    <div className="sm-name">{summary.staff.name}</div>
                    <div className="sm-role">{summary.staff.role || '—'}</div>
                  </div>
                  {summary.settled ? (
                    <span className="set-badge set-badge--settled">Settled</span>
                  ) : (
                    <span className="set-badge set-badge--outstanding">Outstanding</span>
                  )}
                </div>

                <div className="set-breakdown">
                  <div className="set-breakdown-item">
                    <span>Days present</span>
                    <span>{summary.presentDays}</span>
                  </div>

                  {summary.absentPaidDays > 0 && (
                    <div className="set-breakdown-item">
                      <span>
                        Absent (paid)
                        {summary.absentPaidDates.length > 0 && (
                          <span className="set-dates"> ({summary.absentPaidDates.join(', ')})</span>
                        )}
                      </span>
                      <span>{summary.absentPaidDays}</span>
                    </div>
                  )}

                  {summary.absentUnpaidDays > 0 && (
                    <div className="set-breakdown-item set-breakdown-item--deduction">
                      <span>
                        Absent (unpaid)
                        {summary.absentUnpaidDates.length > 0 && (
                          <span className="set-dates"> ({summary.absentUnpaidDates.join(', ')})</span>
                        )}
                      </span>
                      <span>−{summary.absentUnpaidDays}</span>
                    </div>
                  )}

                  {summary.adhocTotal > 0 && (
                    <div className="set-breakdown-item">
                      <span>Adhoc (salary cycle)</span>
                      <span>₹{summary.adhocTotal.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="set-breakdown-item set-breakdown-item--total">
                    <span>Total Payable</span>
                    <span>₹{summary.payout.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {summary.settled ? (
                  <div className="set-settled-info">
                    Paid ₹{summary.settlement.amount.toLocaleString('en-IN')} via {summary.settlement.mode.toUpperCase()}
                    {' · '}{new Date(summary.settlement.settled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                ) : (
                  <button className="btn-primary set-settle-btn" onClick={() => openSettle(summary)}>
                    Settle
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Settle modal */}
      {settling && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettling(null)}>
          <div className="modal-sheet modal-sheet--confirm">
            <div className="modal-header">
              <h3>Settle Payment</h3>
              <button className="modal-close" onClick={() => setSettling(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Amount (₹)</label>
                <input type="number" min="0" value={settleForm.amount}
                  onChange={e => setSettleForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Mode</label>
                <div className="adhoc-toggle-row">
                  {['cash', 'upi'].map(m => (
                    <button key={m} type="button"
                      className={`adhoc-toggle-btn ${settleForm.mode === m ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => setSettleForm(p => ({ ...p, mode: m }))}>
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setSettling(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSettle} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
      {settlingLaundry && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSettlingLaundry(false)}>
          <div className="modal-sheet modal-sheet--confirm">
            <div className="modal-header">
              <h3>Settle Laundry</h3>
              <button className="modal-close" onClick={() => setSettlingLaundry(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Amount (₹)</label>
                <input type="number" min="0" value={laundrySettleForm.amount}
                  onChange={e => setLaundrySettleForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Mode</label>
                <div className="adhoc-toggle-row">
                  {['cash', 'upi'].map(m => (
                    <button key={m} type="button"
                      className={`adhoc-toggle-btn ${laundrySettleForm.mode === m ? 'adhoc-toggle-btn--active' : ''}`}
                      onClick={() => setLaundrySettleForm(p => ({ ...p, mode: m }))}>
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setSettlingLaundry(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleLaundrySettle} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
