
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function JoinHome({ token, user, onJoined }) {
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadInvite()
  }, [token])

  async function loadInvite() {
    setLoading(true)
    const { data, error } = await supabase
      .from('home_invites')
      .select('id, home_id, expires_at, used_at, homes(name)')
      .eq('token', token)
      .single()

    if (error || !data) {
      setError('This invite link is invalid or has expired.')
      setLoading(false)
      return
    }

    if (data.used_at) {
      setError('This invite link has already been used.')
      setLoading(false)
      return
    }

    if (new Date(data.expires_at) < new Date()) {
      setError('This invite link has expired.')
      setLoading(false)
      return
    }

    // Check if user is already a member of this home
    const { data: existing } = await supabase
      .from('home_members')
      .select('id')
      .eq('home_id', data.home_id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      setError('You are already a member of this home.')
      setLoading(false)
      return
    }

    setInvite(data)
    setLoading(false)
  }

  async function handleJoin() {
    if (!invite) return
    setJoining(true)
    setError('')

    try {
      // Add user to home_members
      const { error: memberError } = await supabase
        .from('home_members')
        .insert({
          home_id: invite.home_id,
          user_id: user.id,
          role: 'member',
        })

      if (memberError) throw memberError

      // Mark invite as used
      await supabase
        .from('home_invites')
        .update({ used_at: new Date().toISOString(), used_by: user.id })
        .eq('id', invite.id)

      // Clear the token from the URL
      window.history.replaceState({}, '', '/')

      onJoined({ id: invite.home_id, name: invite.homes.name })
    } catch (err) {
      console.error('Join home error:', err)
      setError('Failed to join home. Please try again.')
    }

    setJoining(false)
  }

  if (loading) return null

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-icon">🏠</span>
          <h1>You've been invited</h1>
          {invite
            ? <p>Join <strong>{invite.homes.name}</strong> on Grihaz</p>
            : <p>Invalid invite</p>
          }
        </div>

        {error && <p className="error">{error}</p>}

        {invite && (
          <button onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining…' : `Join ${invite.homes.name}`}
          </button>
        )}

        {!invite && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
            Ask the home owner to send you a new invite link.
          </p>
        )}
      </div>
    </div>
  )
}
