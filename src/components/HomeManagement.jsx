import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './HomeManagement.css'

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function HomeManagement({ onBack }) {
  const [home, setHome] = useState(null)
  const [members, setMembers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [currentMember, setCurrentMember] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      // Load home
      const { data: memberData } = await supabase
        .from('home_members')
        .select('home_id, role, homes(id, name)')
        .eq('user_id', user.id)
        .single()

      if (!memberData) return
      setHome(memberData.homes)
      setCurrentMember(memberData)

      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()

      setDisplayName(profile?.display_name || '')

      // Load all members of this home
      // Step 1: get members
      const { data: allMembers } = await supabase
        .from('home_members')
        .select('id, user_id, role, invited_at')
        .eq('home_id', memberData.homes.id)
        .order('invited_at')

      // Step 2: get their profiles
      const userIds = (allMembers || []).map(m => m.user_id)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)

      // Step 3: merge
      const profileMap = {}
      ;(profilesData || []).forEach(p => { profileMap[p.id] = p })
      const membersWithProfiles = (allMembers || []).map(m => ({
        ...m,
        profiles: profileMap[m.user_id] || null
      }))
      setMembers(membersWithProfiles)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function handleSaveName() {
    if (!displayName.trim()) return
    setSavingName(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: currentUser.id, display_name: displayName.trim(), updated_at: new Date().toISOString() })
      if (error) throw error
      setEditingName(false)
      loadData()
    } catch (err) {
      console.error(err)
      alert('Failed to save name.')
    }
    setSavingName(false)
  }

  async function handleInvite() {
    try {
      const { data, error } = await supabase
        .from('home_invites')
        .insert({ home_id: home.id, created_by: currentUser.id })
        .select('token')
        .single()
      if (error) throw error
      const link = `${window.location.origin}/?token=${data.token}`
      await navigator.clipboard.writeText(link)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Failed to generate invite link.')
    }
  }

  async function handleRemove(memberId, userId) {
    if (removing) return
    setRemoving(memberId)
    try {
      const { error } = await supabase
        .from('home_members')
        .delete()
        .eq('id', memberId)
      if (error) throw error
      loadData()
    } catch (err) {
      console.error(err)
      alert('Failed to remove member.')
    }
    setRemoving(null)
  }

  const isOwner = currentMember?.role === 'owner'

  if (loading) return (
    <div className="hm-root">
      <div className="sm-loading"><div className="dash-spinner" />Loading…</div>
    </div>
  )

  return (
    <div className="hm-root">
      <header className="hm-header">
        <button className="hm-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1>Manage Home</h1>
      </header>

      <main className="hm-main">

        {/* Home name */}
        <section className="hm-section">
          <div className="hm-section-label">Home</div>
          <div className="hm-info-row">
            <div className="hm-home-icon">🏠</div>
            <div className="hm-home-name">{home?.name}</div>
          </div>
        </section>

        {/* My profile */}
        <section className="hm-section">
          <div className="hm-section-label">My Name</div>
          {editingName ? (
            <div className="hm-name-edit">
              <input
                type="text"
                className="hm-name-input"
                placeholder="Enter your display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoFocus
              />
              <div className="hm-name-actions">
                <button className="btn-ghost" onClick={() => setEditingName(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleSaveName} disabled={savingName}>
                  {savingName ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="hm-name-row" onClick={() => setEditingName(true)}>
              <div className="hm-name-value">
                {displayName || <span className="hm-name-empty">Tap to add your name</span>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          )}
        </section>

        {/* Members */}
        <section className="hm-section">
          <div className="hm-section-label">Members</div>
          <div className="hm-members-list">
            {members.map(m => {
              const name = m.profiles?.display_name
              const isMe = m.user_id === currentUser?.id
              const isThisOwner = m.role === 'owner'
              return (
                <div key={m.id} className="hm-member-row">
                  <div className="hm-member-avatar">{initials(name)}</div>
                  <div className="hm-member-info">
                    <div className="hm-member-name">
                      {name || <span className="hm-name-empty">Unnamed</span>}
                      {isMe && <span className="hm-you-badge">You</span>}
                    </div>
                    <div className="hm-member-role">{isThisOwner ? 'Owner' : 'Member'}</div>
                  </div>
                  {isOwner && !isMe && (
                    <button
                      className="hm-remove-btn"
                      onClick={() => handleRemove(m.id, m.user_id)}
                      disabled={removing === m.id}>
                      {removing === m.id ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Invite */}
        <section className="hm-section">
          <button className="hm-invite-btn" onClick={handleInvite}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            {inviteCopied ? '✓ Link copied!' : 'Add Member — Copy Invite Link'}
          </button>
        </section>

      </main>
    </div>
  )
}
