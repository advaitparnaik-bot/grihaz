import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSendOtp(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (error) {
      setError(JSON.stringify(error))
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    if (error) {
      setError('Invalid or expired code. Please try again.')
    }
    setLoading(false)
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
          <form onSubmit={handleSendOtp}>
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
              {loading ? 'Sending…' : 'Send code'}
            </button>
            <p className="hint">We'll email you a 6-digit code — no password needed.</p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="sent-icon">✉️</div>
            <p>We sent a 6-digit code to <strong>{email}</strong>. Enter it below.</p>
            <p className="hint">Can't find it? Check your spam folder.</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.4rem' }}
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setSent(false); setCode(''); setError('') }}
              className="secondary"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="login-legal">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          {' · '}
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Use</a>
        </p>
      </div>
    </div>
  )
}