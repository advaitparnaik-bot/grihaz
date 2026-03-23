import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CreateHome({ user, onHomeCreated }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: home, error: homeError } = await supabase
      .from('homes')
      .insert({ name: name.trim(), created_by: user.id })
      .select()
      .single()

    if (homeError) {
      setError(homeError.message)
      setLoading(false)
      return
    }

    const { error: memberError } = await supabase
      .from('home_members')
      .insert({ home_id: home.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    onHomeCreated(home)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-icon">🏠</span>
          <h1>Welcome to Grihaz</h1>
          <p>Let's set up your home</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="homeName">What do you call your home?</label>
          <input
            id="homeName"
            type="text"
            placeholder="e.g. Parnaik Residence"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create home'}
          </button>
        </form>
      </div>
    </div>
  )
}