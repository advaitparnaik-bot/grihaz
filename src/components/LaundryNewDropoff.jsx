import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './LaundryNewDropoff.css'

export default function LaundryNewDropoff({ home, onClose, onSaved }) {
  const [rateCard, setRateCard] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // lineItems: [{ category, services: [{ service, unit_price }], quantity }]
  const [lineItems, setLineItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [itemForm, setItemForm] = useState({ category: '', services: [], quantity: 1 })

  // For adding new rate card entry on the fly
  const [showNewRateEntry, setShowNewRateEntry] = useState(false)
  const [newRateForm, setNewRateForm] = useState({ category: '', service: '', unit_price: '' })
  const [savingRate, setSavingRate] = useState(false)

  useEffect(() => { loadRateCard() }, [])

  async function loadRateCard() {
    setLoading(true)
    const { data } = await supabase
      .from('laundry_rate_card')
      .select('*')
      .eq('home_id', home.id)
      .eq('active', true)
      .order('category').order('service')
    setRateCard(data || [])
    setLoading(false)
  }

  // Group rate card by category
  const rateCardByCategory = rateCard.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const categories = Object.keys(rateCardByCategory)

  function getServicesForCategory(category) {
    return rateCardByCategory[category] || []
  }

  function toggleService(serviceObj) {
    setItemForm(prev => {
      const exists = prev.services.find(s => s.service === serviceObj.service)
      if (exists) {
        return { ...prev, services: prev.services.filter(s => s.service !== serviceObj.service) }
      } else {
        return { ...prev, services: [...prev.services, { service: serviceObj.service, unit_price: serviceObj.unit_price }] }
      }
    })
  }

  function getItemTotal(item) {
    const serviceTotal = item.services.reduce((sum, s) => sum + s.unit_price, 0)
    return serviceTotal * item.quantity
  }

  function getGrandTotal() {
    return lineItems.reduce((sum, item) => sum + getItemTotal(item), 0)
  }

  function handleAddItem() {
    if (!itemForm.category || itemForm.services.length === 0 || itemForm.quantity < 1) {
      alert('Please select a category, at least one service, and a valid quantity.')
      return
    }
    setLineItems(prev => [...prev, { ...itemForm }])
    setItemForm({ category: '', services: [], quantity: 1 })
    setShowAddItem(false)
  }

  function removeLineItem(index) {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSaveNewRate() {
    const { category, service, unit_price } = newRateForm
    if (!category.trim() || !service.trim() || !unit_price || parseFloat(unit_price) <= 0) {
      alert('Please fill all fields.')
      return
    }
    setSavingRate(true)
    const { data, error } = await supabase.from('laundry_rate_card')
      .insert({ home_id: home.id, category: category.trim(), service: service.trim(), unit_price: parseFloat(unit_price), active: true })
      .select().single()
    if (error) {
      alert('Failed to add to rate card.')
    } else {
      await loadRateCard()
      setNewRateForm({ category: '', service: '', unit_price: '' })
      setShowNewRateEntry(false)
    }
    setSavingRate(false)
  }

  async function handleSave() {
    if (lineItems.length === 0) {
      alert('Add at least one item.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Create transaction
      const { data: tx, error: txError } = await supabase
        .from('laundry_transactions')
        .insert({ home_id: home.id, date, status: 'open', created_by: user.id })
        .select().single()
      if (txError) throw txError

      // Create line items (one per category+service combo)
      const items = []
      for (const lineItem of lineItems) {
        for (const svc of lineItem.services) {
          items.push({
            transaction_id: tx.id,
            home_id: home.id,
            category: lineItem.category,
            service: svc.service,
            unit_price: svc.unit_price,
            quantity_given: lineItem.quantity,
            quantity_returned: 0,
          })
        }
      }

      const { error: itemsError } = await supabase.from('laundry_transaction_items').insert(items)
      if (itemsError) throw itemsError

      onSaved()
    } catch (err) {
      console.error(err)
      alert('Failed to save drop-off.')
    }
    setSaving(false)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="lnd-root">
        <header className="lnd-header">
        <button className="lnd-back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
            </svg>
        </button>
        <span className="lnd-title">New Drop-off</span>
        </header>

        <div className="lnd-main">
        <div className="form-field">
            <label>Date</label>
            <input type="date" value={date} max={today}
            onChange={e => setDate(e.target.value)} />
        </div>

        {loading ? (
            <div className="lnd-loading"><div className="dash-spinner" /></div>
        ) : rateCard.length === 0 ? (
            <div className="lnd-empty-rate">
            No items in your rate card yet. Go to Manage Home → Laundry Rate Card to add items first.
            </div>
        ) : (
            <>
            {lineItems.length > 0 && (
                <div className="lnd-items-list">
                <div className="lnd-section-label">Items</div>
                {lineItems.map((item, idx) => (
                    <div key={idx} className="lnd-item-row">
                    <div className="lnd-item-info">
                        <span className="lnd-item-category">{item.category}</span>
                        <span className="lnd-item-services">{item.services.map(s => s.service).join(', ')}</span>
                        <span className="lnd-item-qty">× {item.quantity}</span>
                    </div>
                    <div className="lnd-item-right">
                        <span className="lnd-item-total">₹{getItemTotal(item).toLocaleString('en-IN')}</span>
                        <button className="lnd-remove-item" onClick={() => removeLineItem(idx)}>✕</button>
                    </div>
                    </div>
                ))}
                <div className="lnd-grand-total">
                    <span>Total</span>
                    <span>₹{getGrandTotal().toLocaleString('en-IN')}</span>
                </div>
                </div>
            )}

            {showAddItem ? (
                <div className="lnd-add-item-form">
                <div className="lnd-section-label">Add Item</div>
                <div className="form-field">
                    <label>Category</label>
                    <select value={itemForm.category}
                    onChange={e => setItemForm(p => ({ ...p, category: e.target.value, services: [] }))}>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                {itemForm.category && (
                    <div className="form-field">
                    <label>Services</label>
                    <div className="lnd-service-chips">
                        {getServicesForCategory(itemForm.category).map(svc => {
                        const selected = itemForm.services.find(s => s.service === svc.service)
                        return (
                            <button key={svc.id}
                            className={`lnd-service-chip ${selected ? 'lnd-service-chip--active' : ''}`}
                            onClick={() => toggleService(svc)}>
                            {svc.service} · ₹{svc.unit_price}
                            </button>
                        )
                        })}
                    </div>
                    </div>
                )}
                <div className="form-field">
                    <label>Quantity</label>
                    <div className="lnd-qty-row">
                    <button className="lnd-qty-btn"
                        onClick={() => setItemForm(p => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))}>−</button>
                    <span className="lnd-qty-value">{itemForm.quantity}</span>
                    <button className="lnd-qty-btn"
                        onClick={() => setItemForm(p => ({ ...p, quantity: p.quantity + 1 }))}>+</button>
                    </div>
                </div>
                {itemForm.category && itemForm.services.length > 0 && (
                    <div className="lnd-item-preview">
                    {itemForm.category} × {itemForm.quantity} = ₹{getItemTotal(itemForm).toLocaleString('en-IN')}
                    </div>
                )}
                <div className="lnd-add-item-actions">
                    <button className="btn-ghost" onClick={() => setShowAddItem(false)}>Cancel</button>
                    <button className="btn-primary" onClick={handleAddItem}>Add</button>
                </div>
                </div>
            ) : (
                <button className="lnd-add-more-btn" onClick={() => setShowAddItem(true)}>
                + Add Item
                </button>
            )}

            {!showAddItem && (
                showNewRateEntry ? (
                <div className="lnd-new-rate-form">
                    <div className="lnd-section-label">Add to Rate Card</div>
                    <div className="form-field">
                    <label>Category</label>
                    <input type="text" placeholder="e.g. Cushion Cover"
                        value={newRateForm.category}
                        onChange={e => setNewRateForm(p => ({ ...p, category: e.target.value }))} />
                    </div>
                    <div className="form-field">
                    <label>Service</label>
                    <input type="text" placeholder="e.g. Dry Clean"
                        value={newRateForm.service}
                        onChange={e => setNewRateForm(p => ({ ...p, service: e.target.value }))} />
                    </div>
                    <div className="form-field">
                    <label>Price per item (₹)</label>
                    <input type="number" min="0" placeholder="e.g. 120"
                        value={newRateForm.unit_price}
                        onChange={e => setNewRateForm(p => ({ ...p, unit_price: e.target.value }))} />
                    </div>
                    <div className="lnd-add-item-actions">
                    <button className="btn-ghost" onClick={() => setShowNewRateEntry(false)}>Cancel</button>
                    <button className="btn-primary" onClick={handleSaveNewRate} disabled={savingRate}>
                        {savingRate ? 'Saving…' : 'Save to Rate Card'}
                    </button>
                    </div>
                </div>
                ) : (
                <button className="lnd-new-rate-btn" onClick={() => setShowNewRateEntry(true)}>
                    + New item not in rate card
                </button>
                )
            )}
            </>
        )}

        {lineItems.length > 0 && (
            <button className="btn-primary lnd-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Drop-off'}
            </button>
        )}
        </div>
    </div>
    )
}