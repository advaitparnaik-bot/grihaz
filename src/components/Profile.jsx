import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Profile.css'
import ExpensePlatforms from './ExpensePlatforms'

export default function Profile({ user, home, onClose, onNavigate }) {
  const [gmailConnection, setGmailConnection] = useState(null)
  const [loadingGmail, setLoadingGmail] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [showExpensePlatforms, setShowExpensePlatforms] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchGmailConnection()
  }, [])

  async function fetchGmailConnection() {
    setLoadingGmail(true)
    const { data } = await supabase
      .from('home_gmail_connections')
      .select('id, gmail_address, last_synced_at')
      .eq('home_id', home.id)
      .eq('user_id', user.id)
      .maybeSingle()
    setGmailConnection(data)
    setLoadingGmail(false)
  }

  function handleConnectGmail() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const redirectUri = `${window.location.origin}/auth/gmail/callback`
    const scope = 'https://www.googleapis.com/auth/gmail.readonly'
    const state = JSON.stringify({ home_id: home.id, user_id: user.id })
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  async function handleDisconnectGmail() {
    setActionLoading(true)
    await supabase
      .from('home_gmail_connections')
      .delete()
      .eq('id', gmailConnection.id)
    setGmailConnection(null)
    setShowDisconnectConfirm(false)
    setActionLoading(false)
  }

  async function handleSignOut() {
    setActionLoading(true)
    await supabase.auth.signOut()
  }

  async function handleDeleteAllData() {
    setActionLoading(true)
    // Delete in order: expenses, home_gmail_connections, attendance, adhoc_entries,
    // laundry_entries, staff, home_members, homes
    const tables = [
      { table: 'expenses',          col: 'home_id' },
      { table: 'home_gmail_connections', col: 'home_id' },
      { table: 'attendance',        col: 'home_id' },
      { table: 'adhoc_entries',     col: 'home_id' },
      { table: 'laundry_entries',   col: 'home_id' },
      { table: 'staff',             col: 'home_id' },
      { table: 'home_members',      col: 'home_id' },
      { table: 'homes',             col: 'id'      },
    ]
    for (const { table, col } of tables) {
      await supabase.from(table).delete().eq(col, home.id)
    }
    await supabase.auth.signOut()
  }

  function formatLastSynced(ts) {
    if (!ts) return 'Never synced'
    const d = new Date(ts)
    return `Last synced ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <div className="profile-root">
      {/* ── Header ── */}
      <div className="profile-header">
        <button className="profile-back-btn" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="profile-header-title">Profile</span>
        <div style={{ width: 36 }} />
      </div>

      <div className="profile-body">

        {/* ── User card ── */}
        <div className="profile-user-card">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-user-info">
            <div className="profile-user-email">{user?.email}</div>
            <div className="profile-user-home">{home?.name}</div>
          </div>
        </div>

        {/* ── Gmail connection ── */}
        <div className="profile-section">
          <div className="profile-section-label">Gmail Integration</div>
          <div className="profile-card">
            {loadingGmail ? (
              <div className="profile-gmail-loading">Checking connection…</div>
            ) : gmailConnection ? (
              <div className="profile-gmail-connected">
                <div className="profile-gmail-connected-left">
                  <div className="profile-gmail-dot" />
                  <div>
                    <div className="profile-gmail-address">{gmailConnection.gmail_address}</div>
                    <div className="profile-gmail-synced">{formatLastSynced(gmailConnection.last_synced_at)}</div>
                  </div>
                </div>
                <button
                  className="profile-gmail-disconnect-btn"
                  onClick={() => setShowDisconnectConfirm(true)}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="profile-gmail-empty">
                <div className="profile-gmail-empty-text">
                  <div className="profile-gmail-empty-title">Connect Gmail</div>
                  <div className="profile-gmail-empty-sub">
                    Auto-import orders from Blinkit, Zomato and Amazon.
                    You can connect any Gmail — it doesn't need to match your login email.
                  </div>
                </div>
                <button className="profile-gmail-connect-btn" onClick={handleConnectGmail}>
                  Connect
                </button>
              </div>
            )}
          </div>
          <div className="profile-card profile-card--list" style={{ marginTop: '12px' }}>
            <button
              className="profile-list-item"
              onClick={() => setShowExpensePlatforms(true)}
            >
              <span>Configure Expense Platforms</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Home settings ── */}
        <div className="profile-section">
          <div className="profile-section-label">Home</div>
          <div className="profile-card profile-card--list">
            <button
              className="profile-list-item"
              onClick={() => { onNavigate('home_management'); onClose() }}
            >
              <span>Home settings & Members</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Support ── */}
        <div className="profile-section">
          <div className="profile-section-label">Support</div>
          <div className="profile-card profile-card--list">
            <a
              className="profile-list-item"
              href="https://grihaz.rhyea.com/faqs"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>FAQs</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <div className="profile-list-divider" />
            <a
              className="profile-list-item"
              href="https://grihaz.rhyea.com/legal"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Legal</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </div>

        {/* ── Account actions ── */}
        <div className="profile-section">
          <div className="profile-card profile-card--list">
            <button
              className="profile-list-item profile-list-item--signout"
              onClick={() => setShowSignOutConfirm(true)}
            >
              <span>Sign out</span>
            </button>
            <div className="profile-list-divider" />
            <button
              className="profile-list-item profile-list-item--danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <span>Delete all my data</span>
            </button>
          </div>
        </div>

        <div className="profile-version">Grihaz · Rhyea</div>

      </div>

      {/* ── Confirm: Disconnect Gmail ── */}
      {showDisconnectConfirm && (
        <div className="profile-modal-overlay">
          <div className="profile-modal">
            <div className="profile-modal-title">Disconnect Gmail?</div>
            <div className="profile-modal-body">
              {gmailConnection?.gmail_address} will be disconnected. Existing imported expenses won't be deleted, but no new orders will be synced.
            </div>
            <div className="profile-modal-actions">
              <button
                className="profile-modal-btn profile-modal-btn--secondary"
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="profile-modal-btn profile-modal-btn--danger"
                onClick={handleDisconnectGmail}
                disabled={actionLoading}
              >
                {actionLoading ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm: Sign out ── */}
      {showSignOutConfirm && (
        <div className="profile-modal-overlay">
          <div className="profile-modal">
            <div className="profile-modal-title">Sign out?</div>
            <div className="profile-modal-body">
              You'll need your magic link email to sign back in.
            </div>
            <div className="profile-modal-actions">
              <button
                className="profile-modal-btn profile-modal-btn--secondary"
                onClick={() => setShowSignOutConfirm(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="profile-modal-btn profile-modal-btn--primary"
                onClick={handleSignOut}
                disabled={actionLoading}
              >
                {actionLoading ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm: Delete all data ── */}
      {showDeleteConfirm && (
        <div className="profile-modal-overlay">
          <div className="profile-modal">
            <div className="profile-modal-title">Delete all data?</div>
            <div className="profile-modal-body">
              This will permanently delete your home, all staff, attendance records, expenses, and your account. This cannot be undone.
            </div>
            <div className="profile-modal-actions">
              <button
                className="profile-modal-btn profile-modal-btn--secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="profile-modal-btn profile-modal-btn--danger"
                onClick={handleDeleteAllData}
                disabled={actionLoading}
              >
                {actionLoading ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    {showExpensePlatforms && (
        <ExpensePlatforms
          home={home}
          onClose={() => setShowExpensePlatforms(false)}
        />
      )}
    </div>
  )
}
