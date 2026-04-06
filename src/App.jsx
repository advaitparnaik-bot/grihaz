import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import CreateHome from './pages/CreateHome'
import Dashboard from './components/Dashboard'
import StaffManagement from './components/StaffManagement'
import TransactionReview from './components/TransactionReview'
import Settlement from './components/Settlement'
import Profile from './components/Profile'
import './App.css'
import JoinHome from './pages/JoinHome'
import HomeManagement from './components/HomeManagement'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [home, setHome] = useState(null)
  const [homeLoading, setHomeLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showProfile, setShowProfile] = useState(false)   // ← NEW

  useEffect(() => {
    // Save invite token to localStorage before auth redirect clears the URL
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) localStorage.setItem('invite_token', token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchHome(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN' && session) fetchHome(session.user.id)
      if (event === 'SIGNED_OUT') { setHome(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchHome(userId) {
    setHomeLoading(true)
    const { data, error } = await supabase.from('home_members')
      .select('home_id, homes(id, name)')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('fetchHome error:', error.message)
      setHome(null)
    } else {
      setHome(data?.homes || null)
    }

    setHomeLoading(false)
    setLoading(false)
  }

  if (loading || homeLoading) return null
  if (!session) return <Login />

  const params = new URLSearchParams(window.location.search)
  const inviteToken = params.get('token') || localStorage.getItem('invite_token')

  if (!home) {
    if (inviteToken) return <JoinHome token={inviteToken} user={session.user} onJoined={(home) => { localStorage.removeItem('invite_token'); setHome(home) }} />
    return <CreateHome user={session.user} onHomeCreated={setHome} />
  }

  return (
    <div className="app-root">

      {/* ── Top bar ── */}
      <header className="top-bar">
        <div className="top-bar-brand">
          <span className="top-bar-logo-glyph">गृ</span>
          <span className="top-bar-wordmark">grihaz</span>
        </div>
        <div className="top-bar-right">
          <span className="top-bar-home-name">{home.name}</span>
          <button
            className="top-bar-icon-btn"
            onClick={() => setShowProfile(true)}
            aria-label="Open profile"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Tab content ── */}
      <div className="app-content">
        {activeTab === 'dashboard'       && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'home_management' && <HomeManagement onBack={() => setActiveTab('dashboard')} />}
        {activeTab === 'staff'           && <StaffManagement />}
        {activeTab === 'transactions'    && <TransactionReview />}
        {activeTab === 'settlement'      && <Settlement />}
      </div>

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav">
        <button
          className={`bnav-btn ${activeTab === 'dashboard' ? 'bnav-btn--active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Home</span>
        </button>

        <button
          className={`bnav-btn ${activeTab === 'staff' ? 'bnav-btn--active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Staff</span>
        </button>

        {/* ← renamed from History to Ledger */}
        <button
          className={`bnav-btn ${activeTab === 'transactions' ? 'bnav-btn--active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <span>Ledger</span>
        </button>

        <button
          className={`bnav-btn ${activeTab === 'settlement' ? 'bnav-btn--active' : ''}`}
          onClick={() => setActiveTab('settlement')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          <span>Settle</span>
        </button>
      </nav>

      {/* ── Profile overlay ── */}
      {showProfile && (
        <div className="profile-overlay">
          <Profile
            user={session.user}
            home={home}
            onClose={() => setShowProfile(false)}
            onNavigate={(tab) => { setActiveTab(tab); setShowProfile(false) }}
          />
        </div>
      )}

    </div>
  )
}
