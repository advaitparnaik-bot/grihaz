import { useEffect } from 'react'
import { supabase } from './supabase'

export function useGmailCallback() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const isCallback = url.pathname === '/auth/gmail/callback'
    if (!isCallback) return

    const code     = url.searchParams.get('code')
    const stateRaw = url.searchParams.get('state')
    const error    = url.searchParams.get('error')

    window.history.replaceState({}, '', '/')

    if (error || !code || !stateRaw) {
      console.error('Gmail callback error or missing params:', error)
      return
    }

    let state: { home_id: string }
    try { state = JSON.parse(stateRaw) }
    catch { console.error('Gmail callback: invalid state'); return }

    if (!state.home_id) return

    // Store in sessionStorage — the app will pick this up once fully loaded
    sessionStorage.setItem('gmail_pending_code', code)
    sessionStorage.setItem('gmail_pending_home_id', state.home_id)
  }, [])
}

export async function processPendingGmailCallback() {
  const code    = sessionStorage.getItem('gmail_pending_code')
  const home_id = sessionStorage.getItem('gmail_pending_home_id')
  if (!code || !home_id) return null

  sessionStorage.removeItem('gmail_pending_code')
  sessionStorage.removeItem('gmail_pending_home_id')

  // Wait up to 3s for session to be available
  let session = null
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.auth.getSession()
    if (data.session) { session = data.session; break }
    await new Promise(r => setTimeout(r, 300))
  }

  if (!session) { console.error('No session for Gmail callback'); return null }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'connect', code, home_id, redirect_uri: `${window.location.origin}/auth/gmail/callback` }),
  })

  const data = await res.json()
  if (!res.ok) { console.error('Gmail connect failed:', data.error); return null }
  console.log('Gmail connected:', data.gmail_address)
  return data
}