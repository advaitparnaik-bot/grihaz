import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LaundryNewDropoff from './LaundryNewDropoff'
import LaundryMarkReturns from './LaundryMarkReturns'
import './Laundry.css'

export default function Laundry({ home, onClose }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewDropoff, setShowNewDropoff] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState(null)

  useEffect(() => { loadTransactions() }, [])

  async function loadTransactions() {
    setLoading(true)
    const { data } = await supabase
      .from('laundry_transactions')
      .select('*, laundry_transaction_items(*)')
      .eq('home_id', home.id)
      .eq('status', 'open')
      .order('date', { ascending: false })
    setTransactions(data || [])
    setLoading(false)
  }

  function getTransactionSummary(items) {
    const categories = [...new Set(items.map(i => i.category))]
    return categories.slice(0, 3).join(', ') + (categories.length > 3 ? ` +${categories.length - 3} more` : '')
  }

  function getTransactionTotal(items) {
    return items.reduce((sum, i) => sum + (i.unit_price * i.quantity_given), 0)
  }

  function getPendingCount(items) {
    return items.reduce((sum, i) => sum + (i.quantity_given - i.quantity_returned), 0)
  }

  if (showNewDropoff) {
    return (
      <LaundryNewDropoff
        home={home}
        onClose={() => setShowNewDropoff(false)}
        onSaved={() => { setShowNewDropoff(false); loadTransactions() }}
      />
    )
  }

  if (selectedTransaction) {
    return (
      <LaundryMarkReturns
        home={home}
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onSaved={() => { setSelectedTransaction(null); loadTransactions() }}
      />
    )
  }

  return (
    <div className="ldy-root">
      <header className="ldy-header">
        <button className="ldy-back-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="ldy-title">Laundry</span>
      </header>

      <div className="ldy-main">
        <button className="ldy-new-btn" onClick={() => setShowNewDropoff(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Drop-off
        </button>

        {loading ? (
          <div className="ldy-loading"><div className="dash-spinner" /></div>
        ) : transactions.length === 0 ? (
          <div className="ldy-empty">
            <p>No open transactions.</p>
            <p className="ldy-empty-hint">Tap "New Drop-off" to log clothes given for laundry.</p>
          </div>
        ) : (
          <div className="ldy-list">
            <div className="ldy-section-label">Open Transactions</div>
            {transactions.map(tx => {
              const items = tx.laundry_transaction_items || []
              const pending = getPendingCount(items)
              const total = getTransactionTotal(items)
              const summary = getTransactionSummary(items)
              return (
                <div key={tx.id} className="ldy-card" onClick={() => setSelectedTransaction(tx)}>
                  <div className="ldy-card-top">
                    <span className="ldy-card-date">
                      {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="ldy-card-pending">{pending} item{pending !== 1 ? 's' : ''} pending</span>
                  </div>
                  <div className="ldy-card-summary">{summary}</div>
                  <div className="ldy-card-bottom">
                    <span className="ldy-card-total">₹{total.toLocaleString('en-IN')}</span>
                    <span className="ldy-card-action">Mark Returns →</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}