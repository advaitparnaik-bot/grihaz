import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './ExpensePlatforms.css'

const CATEGORIES = [
  { value: 'grocery', label: 'Grocery' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'restaurant', label: 'Food' },
  { value: 'fashion_apparel', label: 'Fashion' },
]

export default function ExpensePlatforms({ home, onClose }) {
  const [platforms, setPlatforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSheet, setShowSheet] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState(null)

  // Form state
  const [platformName, setPlatformName] = useState('')
  const [category, setCategory] = useState('shopping')
  const [senderEmails, setSenderEmails] = useState([''])

  useEffect(() => { loadPlatforms() }, [])

  async function loadPlatforms() {
    setLoading(true)
    const { data } = await supabase
      .from('expense_email_sources')
      .select('*')
      .eq('home_id', home.id)
      .eq('is_active', true)
      .order('platform')
    const grouped = {}
    for (const row of data || []) {
      if (!grouped[row.platform]) {
        grouped[row.platform] = { platform: row.platform, category: row.category, senders: [] }
      }
      grouped[row.platform].senders.push(row.sender_email)
    }
    setPlatforms(Object.values(grouped))
    setLoading(false)
  }

  function openAddSheet() {
    setEditingPlatform(null)
    setPlatformName('')
    setCategory('shopping')
    setSenderEmails([''])
    setShowSheet(true)
  }

  function openEditSheet(p) {
    setEditingPlatform(p.platform)
    setPlatformName(p.platform)
    setCategory(p.category)
    setSenderEmails(p.senders.length > 0 ? p.senders : [''])
    setShowSheet(true)
  }

  function closeSheet() {
    setShowSheet(false)
    setEditingPlatform(null)
  }

  function addEmailField() {
    setSenderEmails(prev => [...prev, ''])
  }

  function removeEmailField(index) {
    setSenderEmails(prev => prev.filter((_, i) => i !== index))
  }

  function updateEmail(index, value) {
    setSenderEmails(prev => prev.map((e, i) => i === index ? value : e))
  }

  async function handleSave() {
    const name = platformName.trim()
    if (!name) return
    const validEmails = senderEmails.map(e => e.trim()).filter(Boolean)
    if (!validEmails.length) return

    setSaving(true)

    if (editingPlatform) {
      // Delete existing rows for this platform then re-insert
      await supabase
        .from('expense_email_sources')
        .delete()
        .eq('home_id', home.id)
        .eq('platform', editingPlatform)

      const rows = validEmails.map(email => ({
        home_id: home.id,
        platform: editingPlatform,
        category,
        sender_email: email,
        is_active: true,
      }))
      await supabase.from('expense_email_sources').insert(rows)
       // Sync category change to existing orders
    await supabase
        .from('expense_orders')
        .update({ category })
        .eq('home_id', home.id)
        .eq('platform', editingPlatform)
    }
    else {
      const rows = validEmails.map(email => ({
        home_id: home.id,
        platform: name.toLowerCase(),
        category,
        sender_email: email,
        is_active: true,
      }))
      await supabase.from('expense_email_sources').insert(rows)
    }

    setSaving(false)
    closeSheet()
    loadPlatforms()
  }

  async function handleDelete(platform) {
    setDeleting(platform)
    await supabase
      .from('expense_email_sources')
      .delete()
      .eq('home_id', home.id)
      .eq('platform', platform)
    setDeleting(null)
    loadPlatforms()
  }

  return (
    <div className="ep-root">
      {/* Header */}
      <div className="ep-header">
        <button className="ep-back-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="ep-header-title">Expense Platforms</span>
        <button className="ep-add-btn" onClick={openAddSheet}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="ep-body">
        {loading ? (
          <div className="ep-loading"><div className="dash-spinner" />Loading…</div>
        ) : platforms.length === 0 ? (
          <div className="ep-empty">
            <p>No platforms configured yet.</p>
            <p>Tap <strong>+</strong> to add your first platform.</p>
          </div>
        ) : (
          <div className="ep-list">
            {platforms.map(p => (
              <div key={p.platform} className="ep-card">
                <div className="ep-card-top">
                  <div className="ep-card-left">
                    <div className="ep-platform-name">
                      {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                    </div>
                    <span className="ep-category-badge">
                      {CATEGORIES.find(c => c.value === p.category)?.label || p.category}
                    </span>
                  </div>
                  <div className="ep-card-actions">
                    <button
                      className="ep-edit-btn"
                      onClick={() => openEditSheet(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="ep-delete-btn"
                      onClick={() => handleDelete(p.platform)}
                      disabled={deleting === p.platform}
                    >
                      {deleting === p.platform ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
                <div className="ep-senders">
                  {p.senders.map(s => (
                    <span key={s} className="ep-sender-chip">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit platform bottom sheet */}
      {showSheet && (
        <div className="ep-overlay">
          <div className="ep-sheet">
            <div className="ep-sheet-header">
              <span className="ep-sheet-title">
                {editingPlatform ? 'Edit Platform' : 'Add Platform'}
              </span>
              <button className="ep-sheet-close" onClick={closeSheet}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="ep-sheet-body">
              <div className="form-field">
                <label>Platform name</label>
                {editingPlatform ? (
                  <div className="ep-platform-name-readonly">
                    {editingPlatform.charAt(0).toUpperCase() + editingPlatform.slice(1)}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Amazon, Zomato, Myntra"
                    value={platformName}
                    onChange={e => setPlatformName(e.target.value)}
                  />
                )}
              </div>
              <div className="form-field">
                <label>Category</label>
                <div className="ep-cat-row">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      className={`ep-cat-btn ${category === c.value ? 'ep-cat-btn--active' : ''}`}
                      onClick={() => setCategory(c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-field">
                <label>Sender email(s)</label>
                {senderEmails.map((email, i) => (
                  <div key={i} className="ep-email-row">
                    <input
                      type="email"
                      placeholder="noreply@example.com"
                      value={email}
                      onChange={e => updateEmail(i, e.target.value)}
                    />
                    {senderEmails.length > 1 && (
                      <button className="ep-email-remove" onClick={() => removeEmailField(i)}>×</button>
                    )}
                  </div>
                ))}
                <button className="ep-add-email-btn" onClick={addEmailField}>
                  + Add another sender
                </button>
              </div>
            </div>
            <div className="ep-sheet-footer">
              <button className="btn-ghost" onClick={closeSheet}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingPlatform ? 'Save Changes' : 'Save Platform'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}