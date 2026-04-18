import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import './Ledger.css'

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

const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'Present', short: 'P' },
  { value: 'absent_paid', label: 'Absent (Paid)', short: 'AP' },
  { value: 'absent_unpaid', label: 'Absent (Unpaid)', short: 'A' },
]

const CATEGORY_LABELS = {
  grocery: 'Grocery',
  shopping: 'Shopping',
  restaurant: 'Food',
  fashion_apparel: 'Fashion',
}

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

export default function Ledger() {
  const [homeId, setHomeId] = useState(null)
  const [allStaff, setAllStaff] = useState([])
  const [emailSources, setEmailSources] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [settledMonths, setSettledMonths] = useState(new Set())
  const [expandedOrders, setExpandedOrders] = useState(new Set())

  // Filters
  const [period, setPeriod] = useState('last_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | staff | expenses
  const [staffFilter, setStaffFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')

  // Edit state
  const [editEntry, setEditEntry] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { loadHome() }, [])
  useEffect(() => {
    if (homeId) loadEntries()
  }, [homeId, period, customFrom, customTo, typeFilter, staffFilter, statusFilter, categoryFilter, platformFilter])

  async function loadHome() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('home_members').select('home_id').eq('user_id', user.id).single()
    if (!data) return
    setHomeId(data.home_id)
    const { data: staffData } = await supabase.from('staff').select('id, name').eq('home_id', data.home_id).order('name')
    setAllStaff(staffData || [])
    const { data: sources } = await supabase.from('expense_email_sources')
      .select('platform, category').eq('home_id', data.home_id).eq('is_active', true)
    setEmailSources(sources || [])
  }

  async function loadEntries() {
    setLoading(true)
    const { from, to } = getDateRange(period, customFrom, customTo)
    if (period === 'custom' && (!from || !to)) { setLoading(false); return }
    if (period === 'custom' && from && to) {
      const diff = (new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)
      if (diff > 92) { setLoading(false); return }
    }

    try {
      let staffEntries = []
      let expenseEntries = []

      // Load staff entries
      if (typeFilter === 'all' || typeFilter === 'staff') {
        let adhocQuery = supabase.from('adhoc_entries')
          .select('*, staff(name, role)')
          .eq('home_id', homeId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false })
        if (staffFilter !== 'all') adhocQuery = adhocQuery.eq('staff_id', staffFilter)

        let attQuery = supabase.from('attendance')
          .select('*, staff(name, role, pay_type, daily_rate, monthly_rate)')
          .eq('home_id', homeId)
          .gte('date', from).lte('date', to)
          .order('date', { ascending: false })
        if (staffFilter !== 'all') attQuery = attQuery.eq('staff_id', staffFilter)

        const { data: settlements } = await supabase.from('settlements')
          .select('staff_id, month').eq('home_id', homeId)
        const settled = new Set((settlements || []).map(s => `${s.staff_id}_${s.month}`))
        setSettledMonths(settled)

        const [{ data: adhocData }, { data: attData }] = await Promise.all([adhocQuery, attQuery])

        const adhocMapped = (adhocData || []).map(e => ({
          id: e.id, staff_id: e.staff_id, type: 'adhoc', date: e.date,
          staff_name: e.staff?.name || '—', staff_role: e.staff?.role || '',
          description: e.description, amount: e.amount,
          entry_type: e.type, settled: e.settled,
          settlement_mode: e.settlement_mode, settlement: e.settlement,
          raw: e,
        }))

        const attMapped = (attData || []).map(e => {
          const monthKey = e.date?.slice(0, 7) + '-01'
          const isSettled = settled.has(`${e.staff_id}_${monthKey}`)
          let amount = null
          if (e.status === 'present' && e.staff?.pay_type === 'per_day') amount = e.staff.daily_rate
          return {
            id: e.id, staff_id: e.staff_id, type: 'attendance', date: e.date,
            staff_name: e.staff?.name || '—', staff_role: e.staff?.role || '',
            description: e.status === 'present' ? 'Present' : e.status === 'absent_paid' ? 'Absent (Paid)' : 'Absent (Unpaid)',
            amount, entry_type: e.status, settled: isSettled,
            settlement_mode: null, settlement: isSettled ? 'settled' : 'outstanding',
            raw: e,
          }
        })

        staffEntries = [...adhocMapped, ...attMapped]
        if (statusFilter === 'settled') staffEntries = staffEntries.filter(e => e.settled)
        if (statusFilter === 'outstanding') staffEntries = staffEntries.filter(e => !e.settled)
      }

      // Load expense orders
      if (typeFilter === 'all' || typeFilter === 'expenses') {
        let expQuery = supabase.from('expense_orders')
          .select('*, expense_order_items(*)')
          .eq('home_id', homeId)
          .gte('order_date', from).lte('order_date', to)
          .order('order_date', { ascending: false })

        if (categoryFilter !== 'all') expQuery = expQuery.eq('category', categoryFilter)
        if (platformFilter !== 'all') expQuery = expQuery.eq('platform', platformFilter)

        const { data: expData } = await expQuery

        expenseEntries = (expData || []).map(e => ({
          id: e.id, type: 'expense', date: e.order_date,
          platform: e.platform, category: e.category,
          order_ref: e.order_ref, amount: Number(e.order_total) || 0,
          items: e.expense_order_items || [],
          raw: e,
        }))
      }

      let laundryEntries = []

    if (typeFilter === 'all' || typeFilter === 'laundry') {
      const { data: ltData } = await supabase
        .from('laundry_transactions')
        .select(`*, laundry_transaction_items(*)`)
        .eq('home_id', homeId)
        .eq('status', 'closed')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })

      // Get unique user IDs to resolve names
      const userIds = [...new Set([
        ...(ltData || []).map(t => t.created_by).filter(Boolean),
        ...(ltData || []).map(t => t.closed_by).filter(Boolean),
      ])]

      let profileMap = {}
      if (userIds.length) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
        ;(profilesData || []).forEach(p => { profileMap[p.id] = p.display_name })
      }

      laundryEntries = (ltData || []).map(t => ({
        id: t.id,
        type: 'laundry',
        date: t.created_at?.split('T')[0],
        closed_at: t.closed_at,
        created_at: t.created_at,
        created_by_name: profileMap[t.created_by] || '—',
        closed_by_name: profileMap[t.closed_by] || '—',
        items: t.laundry_transaction_items || [],
        amount: (t.laundry_transaction_items || []).reduce(
          (sum, i) => sum + (i.unit_price * i.quantity_given), 0
        ),
        raw: t,
      }))
    }

    const combined = [...staffEntries, ...expenseEntries, ...laundryEntries]
      .sort((a, b) => new Date(b.date) - new Date(a.date))

      setEntries(combined)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // Derived: unique platforms for selected category
  const platformsInCategory = categoryFilter === 'all'
    ? [...new Set(emailSources.map(s => s.platform))]
    : [...new Set(emailSources.filter(s => s.category === categoryFilter).map(s => s.platform))]

  // Derived: unique categories from sources
  const availableCategories = [...new Set(emailSources.map(s => s.category))]

  function isMonthSettled(entry) {
    const monthKey = entry.date?.slice(0, 7) + '-01'
    return settledMonths.has(`${entry.staff_id}_${monthKey}`)
  }

  function toggleExpand(id) {
    setExpandedOrders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openEdit(entry) {
    if (isMonthSettled(entry)) return
    setEditEntry(entry)
    if (entry.type === 'adhoc') {
      setEditForm({
        description: entry.raw.description || '',
        amount: entry.raw.amount?.toString() || '',
        payment_type: entry.raw.type || '',
        settlement: entry.raw.settlement || '',
        settlement_mode: entry.raw.settlement_mode || '',
      })
    } else {
      setEditForm({ status: entry.raw.status })
    }
    setShowDeleteConfirm(false)
  }

  function closeEdit() {
    setEditEntry(null)
    setEditForm({})
    setShowDeleteConfirm(false)
  }

  async function handleSave() {
    if (!editEntry) return
    setSaving(true)
    try {
      if (editEntry.type === 'adhoc') {
        const { error } = await supabase.from('adhoc_entries').update({
          description: editForm.description.trim(),
          amount: editForm.payment_type === 'no_payment' ? null : parseFloat(editForm.amount),
          type: editForm.payment_type,
          settlement: editForm.payment_type === 'no_payment' ? null : editForm.settlement,
          settlement_mode: editForm.settlement === 'now' ? editForm.settlement_mode : null,
          settled: editForm.settlement === 'now',
        }).eq('id', editEntry.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('attendance').update({
          status: editForm.status,
        }).eq('id', editEntry.id)
        if (error) throw error
      }
      closeEdit()
      loadEntries()
    } catch (err) {
      console.error(err)
      alert('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editEntry) return
    setSaving(true)
    try {
      const table = editEntry.type === 'adhoc' ? 'adhoc_entries' : 'attendance'
      const { error } = await supabase.from(table).delete().eq('id', editEntry.id)
      if (error) throw error
      closeEdit()
      loadEntries()
    } catch (err) {
      console.error(err)
      alert('Failed to delete. Please try again.')
    }
    setSaving(false)
  }

  const total = entries.reduce((sum, e) => sum + (e.amount || 0), 0)
  const maxDate = new Date().toISOString().split('T')[0]
  const minCustomTo = customFrom ? (() => { const d = new Date(customFrom); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })() : ''
  const maxCustomTo = customFrom ? (() => { const d = new Date(customFrom); d.setDate(d.getDate() + 92); const today = new Date(); return (d > today ? today : d).toISOString().split('T')[0] })() : maxDate

  return (
    <div className="tr-root">
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

        {/* Type filter */}
        <div className="tr-filter-group">
          <label>Type</label>
          <div className="tr-chip-row">
            {[
              { value: 'all', label: 'All' },
              { value: 'staff', label: 'Staff' },
              { value: 'expenses', label: 'Expenses' },
              { value: 'laundry', label: 'Laundry' },
            ].map(o => (
              <button key={o.value} className={`tr-chip ${typeFilter === o.value ? 'tr-chip--active' : ''}`}
                onClick={() => {
                  setTypeFilter(o.value)
                  setStaffFilter('all')
                  setStatusFilter('all')
                  setCategoryFilter('all')
                  setPlatformFilter('all')
                }}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* Staff sub-filters */}
        {(typeFilter === 'staff') && (
          <>
            <div className="tr-filter-group">
              <label>Staff</label>
              <select className="tr-select" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="all">All Staff</option>
                {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="tr-filter-group">
              <label>Status</label>
              <div className="tr-chip-row">
                {STATUS_OPTIONS.map(o => (
                  <button key={o.value} className={`tr-chip ${statusFilter === o.value ? 'tr-chip--active' : ''}`}
                    onClick={() => setStatusFilter(o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Expense sub-filters */}
        {typeFilter === 'expenses' && (
          <>
            <div className="tr-filter-group">
              <label>Category</label>
              <div className="tr-chip-row">
                <button className={`tr-chip ${categoryFilter === 'all' ? 'tr-chip--active' : ''}`}
                  onClick={() => { setCategoryFilter('all'); setPlatformFilter('all') }}>All</button>
                {availableCategories.map(c => (
                  <button key={c} className={`tr-chip ${categoryFilter === c ? 'tr-chip--active' : ''}`}
                    onClick={() => { setCategoryFilter(c); setPlatformFilter('all') }}>
                    {CATEGORY_LABELS[c] || c}
                  </button>
                ))}
              </div>
            </div>

            {categoryFilter !== 'all' && platformsInCategory.length > 1 && (
              <div className="tr-filter-group">
                <label>Platform</label>
                <div className="tr-chip-row">
                  <button className={`tr-chip ${platformFilter === 'all' ? 'tr-chip--active' : ''}`}
                    onClick={() => setPlatformFilter('all')}>All</button>
                  {platformsInCategory.map(p => (
                    <button key={p} className={`tr-chip ${platformFilter === p ? 'tr-chip--active' : ''}`}
                      onClick={() => setPlatformFilter(p)}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
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
            {entries.map(e => {

              if (e.type === 'laundry') {
                const expanded = expandedOrders.has(e.id)
                const dropOffDate = new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                const closedDate = e.closed_at
                  ? new Date(e.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : '—'
                return (
                  <div key={`laundry-${e.id}`} className="tr-card tr-card--laundry">
                    <div className="tr-card-left">
                      <div className="tr-date">{dropOffDate}</div>
                      <div className="tr-dot tr-dot--laundry" />
                    </div>
                    <div className="tr-card-body">
                      <div className="tr-staff">Drop-off {dropOffDate} · Returned {closedDate}</div>
                      {expanded && (
                        <div className="tr-items">
                          {e.items.map(item => (
                            <div key={item.id} className="tr-item-row">
                              <span className="tr-item-name">{item.category} · {item.service}</span>
                              <span className="tr-item-price">
                                {item.quantity_given} × ₹{Number(item.unit_price).toLocaleString('en-IN')}
                              </span>
                            </div>
                          ))}
                          <div className="tr-item-row tr-item-row--meta">
                            <span className="tr-item-name">Dropped by</span>
                            <span className="tr-item-price">{e.created_by_name}</span>
                          </div>
                          <div className="tr-item-row tr-item-row--meta">
                            <span className="tr-item-name">Returned by</span>
                            <span className="tr-item-price">{e.closed_by_name}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="tr-card-right">
                      <div className="tr-amount">₹{e.amount.toLocaleString('en-IN')}</div>
                      <button className="tr-expand-btn" onClick={() => toggleExpand(e.id)}>
                        {expanded ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                )
              }
              if (e.type === 'expense') {
                const expanded = expandedOrders.has(e.id)
                return (
                  <div key={`expense-${e.id}`} className="tr-card tr-card--expense">
                    <div className="tr-card-left">
                      <div className="tr-date">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                      <div className="tr-dot tr-dot--expense" />
                      <span className="tr-expense-tag">{CATEGORY_LABELS[e.category] || e.category}</span>
                    </div>
                    <div className="tr-card-body">
                      <div className="tr-staff">{e.platform.charAt(0).toUpperCase() + e.platform.slice(1)}</div>
                      {e.order_ref && <div className="tr-desc">Order #{e.order_ref}</div>}
                      {expanded && e.items.length > 0 && (
                        <div className="tr-items">
                          {e.items.map(item => (
                            <div key={item.id} className="tr-item-row">
                              <span className="tr-item-name">{item.item_name}</span>
                              <span className="tr-item-price">
                                {item.quantity > 1 ? `${item.quantity} × ` : ''}
                                ₹{Number(item.unit_price).toLocaleString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="tr-card-right">
                      <div className="tr-amount">₹{e.amount.toLocaleString('en-IN')}</div>
                      {e.items.length > 0 && (
                        <button className="tr-expand-btn" onClick={() => toggleExpand(e.id)}>
                          {expanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              // Staff entry
              const locked = isMonthSettled(e)
              return (
                <div key={`${e.type}-${e.id}`}
                  className={`tr-card ${!locked ? 'tr-card--tappable' : ''}`}
                  onClick={() => !locked && openEdit(e)}>
                  <div className="tr-card-left">
                    <div className="tr-date">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                    <div className={`tr-dot tr-dot--${e.settled ? 'settled' : 'outstanding'}`} />
                    {e.type === 'adhoc' && <span className="tr-adhoc-tag">Adhoc</span>}
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
                    {!locked && <div className="tr-edit-hint">tap to edit</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Edit modal */}
      {editEntry && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div className="modal-sheet">
            <div className="modal-header">
              <h3>{editEntry.type === 'adhoc' ? 'Edit Adhoc Entry' : 'Edit Attendance'}</h3>
              <button className="modal-close" onClick={closeEdit}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="tr-edit-meta">
                <span className="tr-edit-meta-name">{editEntry.staff_name}</span>
                <span className="tr-edit-meta-date">
                  {new Date(editEntry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>

              {editEntry.type === 'attendance' ? (
                <div className="form-field">
                  <label>Status <span className="req">*</span></label>
                  <div className="adhoc-toggle-row">
                    {ATTENDANCE_STATUSES.map(s => (
                      <button key={s.value} type="button"
                        className={`adhoc-toggle-btn ${editForm.status === s.value ? 'adhoc-toggle-btn--active' : ''}`}
                        onClick={() => setEditForm(p => ({ ...p, status: s.value }))}>
                        {s.short}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-field">
                    <label>Description <span className="req">*</span></label>
                    <input type="text" value={editForm.description}
                      onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Payment Type</label>
                    <div className="pay-type-options">
                      {['contract', 'custom', 'reimbursement', 'no_payment'].map(pt => (
                        <button key={pt} type="button"
                          className={`pay-type-btn ${editForm.payment_type === pt ? 'pay-type-btn--active' : ''}`}
                          onClick={() => setEditForm(p => ({ ...p, payment_type: pt }))}>
                          <span className="pt-label">
                            {pt === 'contract' ? 'Contract Rate' :
                             pt === 'custom' ? 'Custom Amount' :
                             pt === 'reimbursement' ? 'Reimbursement' : 'No Payment'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {editForm.payment_type !== 'no_payment' && (
                    <div className="form-field">
                      <label>Amount (₹)</label>
                      <input type="number" min="0" value={editForm.amount}
                        onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} />
                    </div>
                  )}
                  {editForm.payment_type !== 'no_payment' && (
                    <div className="form-field">
                      <label>Settlement</label>
                      <div className="adhoc-toggle-row">
                        <button type="button"
                          className={`adhoc-toggle-btn ${editForm.settlement === 'now' ? 'adhoc-toggle-btn--active' : ''}`}
                          onClick={() => setEditForm(p => ({ ...p, settlement: 'now' }))}>Settle Now</button>
                        <button type="button"
                          className={`adhoc-toggle-btn ${editForm.settlement === 'salary_cycle' ? 'adhoc-toggle-btn--active' : ''}`}
                          onClick={() => setEditForm(p => ({ ...p, settlement: 'salary_cycle', settlement_mode: '' }))}>Salary Cycle</button>
                      </div>
                    </div>
                  )}
                  {editForm.settlement === 'now' && (
                    <div className="form-field">
                      <label>Mode</label>
                      <div className="adhoc-toggle-row">
                        {['cash', 'upi'].map(m => (
                          <button key={m} type="button"
                            className={`adhoc-toggle-btn ${editForm.settlement_mode === m ? 'adhoc-toggle-btn--active' : ''}`}
                            onClick={() => setEditForm(p => ({ ...p, settlement_mode: m }))}>
                            {m.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!showDeleteConfirm ? (
                <button className="tr-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                  Delete this entry
                </button>
              ) : (
                <div className="tr-delete-confirm">
                  <p>Are you sure? This cannot be undone.</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                    <button className="tr-delete-confirm-btn" onClick={handleDelete} disabled={saving}>
                      {saving ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={closeEdit}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}