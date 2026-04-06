// src/lib/gmailCallback.js
// Handles the Gmail OAuth redirect back to the app.
//
// Google redirects to:
//   /auth/gmail/callback?code=AUTH_CODE&state={"home_id":"...","user_id":"..."}
//
// This hook detects that URL on app load, calls the gmail-sync Edge Function
// to exchange the code for tokens and run the initial 90-day sync, then
// cleans up the URL so the app loads normally.

import { useEffect } from 'react'
import { supabase } from './supabase'

export function useGmailCallback() {
  useEffect(() => {
    const url    = new URL(window.location.href)
    const isCallback = url.pathname === '/auth/gmail/callback'

    if (!isCallback) return

    const code      = url.searchParams.get('code')
    const stateRaw  = url.searchParams.get('state')
    const error     = url.searchParams.get('error')

    // Clean up the URL immediately so user doesn't see the callback params
    window.history.replaceState({}, '', '/')

    if (error) {
      console.error('Gmail OAuth error:', error)
      return
    }

    if (!code || !stateRaw) {
      console.error('Gmail callback missing code or state')
      return
    }

    let state: { home_id: string; user_id: string }
    try {
      state = JSON.parse(stateRaw)
    } catch {
      console.error('Gmail callback: invalid state JSON')
      return
    }

    if (!state.home_id) {
      console.error('Gmail callback: missing home_id in state')
      return
    }

    // Call the Edge Function to exchange code for tokens + run first sync
    async function handleCallback() {
      try {
        // Wait up to 5 seconds for session to be restored
        let session = null
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession()
          if (data.session) { session = data.session; break }
          await new Promise(r => setTimeout(r, 500))
        }
        if (!session) {
          console.error('Gmail callback: no active session after waiting')
          return
        }

        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`

        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action:  'connect',
            code,
            home_id: state.home_id,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          console.error('Gmail connect failed:', data.error)
          return
        }

        console.log('Gmail connected:', data.message)
        // The Profile component will re-fetch connection status on next open
        // No further action needed here — the user is back on the home screen

      } catch (err) {
        console.error('Gmail callback error:', err)
      }
    }

    handleCallback()
  }, [])
}
