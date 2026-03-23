import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './TransactionReview.css'

const PERIOD_OPTIONS = [
  { value: 'last_week', label: 'Last 7 days' },
  { value: 'last_month', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'settled', label: 'Settled' },
  { value: 'outstanding', label: 'Outstanding' },
]

function getDateRange(period, customFrom, customTo) {
  const today = new Date()
  const fmt = d => d.toISOString().split('T')[0]
  if (period === 'last_week') {
    const from = new Date(today); from.setDate(today.getDate() - 7)
    return { from: fmt(from), to: fmt(today) }
  }
  if (period === 'last_month') {
    const from = new Date(today); from.setDate(today.getDate() - 30)
    return { from: fmt(from), to: fmt(today) }
  }
  return { from: customFrom, to: customTo }
}

export default function TransactionReview() {
  const [homeId, setHomeId] = useState(null)
  const [allStaff, setAllStaff] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState('last_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [staffFilter, setStaffFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { loadHome() }, [])
  useEffect(() => { if (homeId) loadEntries() }, [homeId, period, customFrom, customTo, staffFilter, statusFilter])

  async function loadHome() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('home_members').select('home_id').eq('user_id', user.id).single()
    if (!data) return
    setHomeId(data.home_id)
    const { data: staffData } = await supabase.from('staff').select('id, name').eq('home_id', data.home_id).order('name')
    setAllStaff(staffData || [])
  }

  async function loadEntries() {
    setLoading(true)
    const { from, to } = getDateRange(period, customFrom, customTo)
    if (period === 'custom' && (!from || !to)) { setLoading(false); return }

    // Validate custom range max 3 months
    if (period === 'custom' && from && to) {
      const diff = (new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)
      if (diff > 92) { setLoading(false); return }
    }

    try {
      // Load adhoc entries
      let adhocQuery = supabase.from('adhoc_entries')
        .select('*, staff(name, role)')
        .eq('home_id', homeId)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (staffFilter !== 'all') adhocQuery = adhocQuery.eq('staff_id', staffFilter)

      // Load attendance
      let attQuery = supabase.from('attendance')
        .select('*, staff(name, role, pay_type, daily_rate, monthly_rate)')
        .eq('home_id', homeId)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false })
      if (staffFilter !== 'all') attQuery = attQuery.eq('staff_id', staffFilter)

      // Load settlements to cross-reference
      const { data: settlements } = await supabase.from('settlements')
        .select('staff_id, month').eq('home_id', homeId)

      const settledMonths = new Set((settlements || []).map(s => `${s.staff_id}_${s.month}`))

      const [{ data: adhocData }, { data: attData }] = await Promise.all([adhocQuery, attQuery])

      // Format adhoc entries
      const adhocEntries = (adhocData || []).map(e => ({
        id: e.id,
        type: 'adhoc',
        date: e.date,
        staff_name: e.staff?.name || '—',
        staff_role: e.staff?.role || '',
        description: e.description,
        amount: e.amount,
        entry_type: e.type,
        settled: e.settled,
        settlement_mode: e.settlement_mode,
        settlement: e.settlement,
      }))

      // Format attendance entries
      const attEntries = (attData || []).map(e => {
        const monthKey = e.date?.slice(0, 7) + '-01'
        const isSettled = settledMonths.has(`${e.staff_id}_${monthKey}`)
        let amount = null
        if (e.status === 'present' && e.staff?.pay_type === 'per_day') amount = e.staff.daily_rate
        return {
          id: e.id,
          type: 'attendance',
          date: e.date,
          staff_name: e.staff?.name || '—',
          staff_role: e.staff?.role || '',
          description: e.status === 'present' ? 'Present' : e.status === 'absent_paid' ? 'Absent (Paid)' : 'Absent (Unpaid)',
          amount,
          entry_type: e.status,
          settled: isSettled,
          settlement_mode: null,
          settlement: isSettled ? 'settled' : 'outstanding',
        }
      })

      let combined = [...adhocEntries, ...attEntries]
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      // Status filter
      if (statusFilter === 'settled') combined = combined.filter(e => e.settled)
      if (statusFilter === 'outstanding') combined = combined.filter(e => !e.settled)

      setEntries(combined)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const total = entries.reduce((sum, e) => sum + (e.amount || 0), 0)

  const maxDate = new Date().toISOString().split('T')[0]
  const minCustomTo = customFrom ? (() => { const d = new Date(customFrom); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })() : ''
  const maxCustomTo = customFrom ? (() => { const d = new Date(customFrom); d.setDate(d.getDate() + 92); const today = new Date(); return (d > today ? today : d).toISOString().split('T')[0] })() : maxDate

  return (
    <div className="tr-root">
      <header className="sm-header"><h1>Transactions</h1></header>

      <div className="tr-filters">
        {/* Period */}
        <div className="tr-filter-group">
          <label>Period</label>
          <div className="tr-chip-row">
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} className={`tr-chip ${period === o.value ? 'tr-chip--active' : ''}`}
                onClick={() => setPeriod(o.value)}>{o.label}</button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="tr-date-row">
            <div className="form-field">
              <label>From</label>
              <input type="date" value={customFrom} max={maxDate}
                onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className="form-field">
              <label>To</label>
              <input type="date" value={customTo} min={minCustomTo} max={maxCustomTo}
                onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* Staff */}
        <div className="tr-filter-group">
          <label>Staff</label>
          <select className="tr-select" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            <option value="all">All Staff</option>
            {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Status */}
        <div className="tr-filter-group">
          <label>Status</label>
          <div className="tr-chip-row">
            {STATUS_OPTIONS.map(o => (
              <button key={o.value} className={`tr-chip ${statusFilter === o.value ? 'tr-chip--active' : ''}`}
                onClick={() => setStatusFilter(o.value)}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="tr-summary">
        <span>{entries.length} transactions</span>
        <span className="tr-total">₹{total.toLocaleString('en-IN')}</span>
      </div>

      <main className="tr-main">
        {loading ? (
          <div className="sm-loading"><div className="dash-spinner" />Loading…</div>
        ) : entries.length === 0 ? (
          <div className="sm-empty"><p>No transactions found.</p></div>
        ) : (
          <div className="tr-list">
            {entries.map(e => (
              <div key={`${e.type}-${e.id}`} className="tr-card">
                <div className="tr-card-left">
                  <div className="tr-date">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                  <div className={`tr-dot tr-dot--${e.settled ? 'settled' : 'outstanding'}`} />
                </div>
                <div className="tr-card-body">
                  <div className="tr-staff">{e.staff_name}{e.staff_role ? ` · ${e.staff_role}` : ''}</div>
                  <div className="tr-desc">{e.description}</div>
                  {e.settlement_mode && <div className="tr-mode">{e.settlement_mode.toUpperCase()}</div>}
                </div>
                <div className="tr-card-right">
                  {e.amount != null && <div className="tr-amount">₹{e.amount.toLocaleString('en-IN')}</div>}
                  <div className={`tr-status ${e.settled ? 'tr-status--settled' : 'tr-status--outstanding'}`}>
                    {e.settled ? 'Settled' : 'Outstanding'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
