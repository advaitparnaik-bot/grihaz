import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const redirectTo = import.meta.env.VITE_APP_URL || window.location.origin

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-icon">🏠</span>
          <h1>Grihaz</h1>
          <p>Technology rooted in tradition</p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading || !email}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="hint">
              We'll email you a link — no password needed.
            </p>
          </form>
        ) : (
          <div className="sent-state">
            <div className="sent-icon">✉️</div>
            <h2>Check your inbox</h2>
            <p>We sent a magic link to <strong>{email}</strong>. Click it to sign in.</p>
            <button onClick={() => { setSent(false); setEmail('') }} className="secondary">
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}