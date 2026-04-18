import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './LaundryRateCard.css'

const DEFAULT_CATEGORIES = ['Shirt', 'T-Shirt', 'Trouser', 'Jeans', 'Kurta', 'Saree', 'Bedsheet', 'Pillow Cover', 'Towel', 'Jacket', 'Suit']
const DEFAULT_SERVICES = ['Wash', 'Iron', 'Wash + Iron', 'Dry Clean']

export default function LaundryRateCard({ homeId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: '', customCategory: '', service: '', customService: '', unit_price: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase
      .from('laundry_rate_card')
      .select('*')
      .eq('home_id', homeId)
      .eq('active', true)
      .order('category').order('service')
    setItems(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    const category = form.category === '__custom__' ? form.customCategory.trim() : form.category
    const service = form.service === '__custom__' ? form.customService.trim() : form.service
    const price = parseFloat(form.unit_price)
    if (!category || !service || isNaN(price) || price <= 0) {
      alert('Please fill all fields with valid values.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('laundry_rate_card').insert({
      home_id: homeId, category, service, unit_price: price, active: true
    })
    if (error) {
      if (error.code === '23505') alert('This category + service combo already exists.')
      else alert('Failed to add.')
    } else {
      setForm({ category: '', customCategory: '', service: '', customService: '', unit_price: '' })
      setShowAdd(false)
      loadItems()
    }
    setSaving(false)
  }

  async function handleDeactivate(id) {
    await supabase.from('laundry_rate_card').update({ active: false }).eq('id', id)
    loadItems()
  }

  return (
    <div className="lrc-root">
      <div className="lrc-header-row">
        <button className="lrc-add-btn" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? 'Cancel' : '+ Add'}
        </button>
    </div>

      {showAdd && (
        <div className="lrc-form">
          <div className="form-field">
            <label>Category</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value, customCategory: '' }))}>
              <option value="">Select category</option>
              {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">+ Custom</option>
            </select>
          </div>
          {form.category === '__custom__' && (
            <div className="form-field">
              <label>Custom Category</label>
              <input type="text" placeholder="e.g. Cushion Cover"
                value={form.customCategory} onChange={e => setForm(p => ({ ...p, customCategory: e.target.value }))} />
            </div>
          )}
          <div className="form-field">
            <label>Service</label>
            <select value={form.service} onChange={e => setForm(p => ({ ...p, service: e.target.value, customService: '' }))}>
              <option value="">Select service</option>
              {DEFAULT_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">+ Custom</option>
            </select>
          </div>
          {form.service === '__custom__' && (
            <div className="form-field">
              <label>Custom Service</label>
              <input type="text" placeholder="e.g. Starch"
                value={form.customService} onChange={e => setForm(p => ({ ...p, customService: e.target.value }))} />
            </div>
          )}
          <div className="form-field">
            <label>Price per item (₹)</label>
            <input type="number" min="0" placeholder="e.g. 30"
              value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} />
          </div>
          <button className="btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? 'Saving…' : 'Add to Rate Card'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="lrc-loading"><div className="dash-spinner" /></div>
      ) : items.length === 0 ? (
        <div className="lrc-empty">No items yet. Add your first item above.</div>
      ) : (
        <div className="lrc-list">
          {items.map(item => (
            <div key={item.id} className="lrc-row">
              <div className="lrc-row-info">
                <span className="lrc-category">{item.category}</span>
                <span className="lrc-service">{item.service}</span>
              </div>
              <div className="lrc-row-right">
                <span className="lrc-price">₹{Number(item.unit_price).toLocaleString('en-IN')}</span>
                <button className="lrc-remove-btn" onClick={() => handleDeactivate(item.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}