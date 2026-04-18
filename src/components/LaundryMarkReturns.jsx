import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './LaundryMarkReturns.css'

export default function LaundryMarkReturns({ home, transaction, onClose, onSaved }) {
  const items = transaction.laundry_transaction_items || []

  // Group items by category for display
  // Each category row shows all services and tracks returns at category level
  const categories = [...new Set(items.map(i => i.category))]

  // returnState: { [category]: quantity_returned } — starts at max already returned
  const initialReturnState = {}
  categories.forEach(cat => {
    const catItems = items.filter(i => i.category === cat)
    // All items in a category have the same quantity_given and quantity_returned
    // (since we return at category level)
    initialReturnState[cat] = catItems[0]?.quantity_returned || 0
  })

  const [returnState, setReturnState] = useState(initialReturnState)
  const [saving, setSaving] = useState(false)

  function getQuantityGiven(category) {
    const catItems = items.filter(i => i.category === category)
    return catItems[0]?.quantity_given || 0
  }

  function getServicesForCategory(category) {
    return items.filter(i => i.category === category).map(i => i.service).join(', ')
  }

  function getTotalForCategory(category) {
    return items
      .filter(i => i.category === category)
      .reduce((sum, i) => sum + (i.unit_price * i.quantity_given), 0)
  }

  function isPendingCategory(category) {
    const given = getQuantityGiven(category)
    const returned = returnState[category] || 0
    return returned < given
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Update quantity_returned for each item
      for (const cat of categories) {
        const catItems = items.filter(i => i.category === cat)
        const newReturned = returnState[cat] || 0
        for (const item of catItems) {
          await supabase
            .from('laundry_transaction_items')
            .update({ quantity_returned: newReturned })
            .eq('id', item.id)
        }
      }

      // Check if all items fully returned
      const allReturned = categories.every(cat => {
        const given = getQuantityGiven(cat)
        const returned = returnState[cat] || 0
        return returned >= given
      })

      if (allReturned) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase
            .from('laundry_transactions')
            .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by: user.id,
            })
            .eq('id', transaction.id)
        }

      onSaved()
    } catch (err) {
      console.error(err)
      alert('Failed to save returns.')
    }
    setSaving(false)
  }

  const grandTotal = items.reduce((sum, i) => sum + (i.unit_price * i.quantity_given), 0)
  const displayDate = new Date(transaction.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="lmr-root">
        <header className="lmr-header">
        <button className="lmr-back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
            </svg>
        </button>
        <div className="lmr-header-info">
            <span className="lmr-title">Mark Returns</span>
            <span className="lmr-date">{displayDate}</span>
        </div>
        </header>

        <div className="lmr-main">
        <div className="lmr-list">
            {categories.map(cat => {
            const given = getQuantityGiven(cat)
            const returned = returnState[cat] || 0
            const pending = given - returned
            const services = getServicesForCategory(cat)
            const total = getTotalForCategory(cat)

            return (
                <div key={cat} className={`lmr-row ${pending === 0 ? 'lmr-row--done' : ''}`}>
                <div className="lmr-row-info">
                    <span className="lmr-category">{cat}</span>
                    <span className="lmr-services">{services}</span>
                    <span className="lmr-given">Given: {given} · ₹{total.toLocaleString('en-IN')}</span>
                </div>
                <div className="lmr-row-right">
                    {pending === 0 ? (
                    <span className="lmr-done-badge">✓ Returned</span>
                    ) : (
                    <div className="lmr-return-control">
                        <div className="lmr-qty-row">
                        <button className="lmr-qty-btn"
                            onClick={() => setReturnState(p => ({ ...p, [cat]: Math.max(0, (p[cat] || 0) - 1) }))}>−</button>
                        <span className="lmr-qty-value">{returned}</span>
                        <button className="lmr-qty-btn"
                            onClick={() => setReturnState(p => ({ ...p, [cat]: Math.min(given, (p[cat] || 0) + 1) }))}>+</button>
                        </div>
                        <span className="lmr-pending-label">{pending} pending</span>
                        <button className="lmr-all-btn"
                        onClick={() => setReturnState(p => ({ ...p, [cat]: given }))}>
                        All returned
                        </button>
                    </div>
                    )}
                </div>
                </div>
            )
            })}
        </div>

        <div className="lmr-total-row">
            <span>Total</span>
            <span>₹{grandTotal.toLocaleString('en-IN')}</span>
        </div>
        </div>

        <div className="lmr-footer">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Returns'}
        </button>
        </div>
    </div>
    )
}