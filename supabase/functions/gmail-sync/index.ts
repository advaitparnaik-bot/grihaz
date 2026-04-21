// supabase/functions/gmail-sync/index.ts
// Grihaz — Gmail Sync Edge Function
//
// Endpoints (all POST):
//   { action: 'connect',    code, home_id }           — OAuth callback, store tokens, first sync
//   { action: 'sync',       home_id }                 — sync calling user's Gmail
//   { action: 'sync-all',   home_id }                 — sync ALL members' Gmail (pg_cron)
//   { action: 'disconnect', home_id }                 — remove calling user's connection
//   { action: 'status',     home_id }                 — check calling user's connection status
//
// Secrets required:
//   ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
// Built-in (automatic):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_API_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!
const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const APP_URL              = Deno.env.get('APP_URL')!

const GMAIL_REDIRECT_URI   = `${APP_URL}/auth/gmail/callback`
const GMAIL_TOKEN_URL      = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE       = 'https://gmail.googleapis.com/gmail/v1/users/me'


// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ─── Supabase clients ──────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })
}

function getUserClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

// ─── Gmail API ────────────────────────────────────────────────────────────────

function buildGmailQuery(daysBack: number, senders: string[]): string {
  const after   = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const dateStr = after.toISOString().split('T')[0].replace(/-/g, '/')
  const from    = senders.map(s => `from:${s}`).join(' OR ')
  return `(${from}) after:${dateStr}`
}

async function searchEmails(accessToken: string, query: string, maxResults = 10) {
  const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status}`)
  const data = await res.json()
  return (data.messages || []) as { id: string }[]
}

async function fetchEmailBody(accessToken: string, messageId: string): Promise<{ body: string, sentDate: string | null, senderEmail: string | null }> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return { body: '', sentDate: null, senderEmail: null }
  const data = await res.json()
  const headers: any[] = data.payload?.headers || []
  const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || null
  const sentDate = dateHeader ? new Date(dateHeader).toISOString().split('T')[0] : null
  const fromHeader = headers.find((h: any) => h.name === 'From')?.value || null
  const senderEmail = fromHeader ? fromHeader.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase() : null

  function extractBody(payload: any): string {
    if (!payload) return ''

    // Prefer text/html, fall back to text/plain
    function findPart(p: any, mimeType: string): string {
      if (!p) return ''
      if (p.mimeType === mimeType && p.body?.data) {
        return atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      if (p.parts) {
        for (const part of p.parts) {
          const found = findPart(part, mimeType)
          if (found) return found
        }
      }
      return ''
    }

    return findPart(payload, 'text/plain') || findPart(payload, 'text/html')
  }

  const rawBody = extractBody(data.payload)
  return { body: stripHtml(rawBody), sentDate, senderEmail }
  }
  function stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s{2,}/g, ' ')
      .trim()
}
// ─── Anthropic extraction ─────────────────────────────────────────────────────

function buildExtractionPrompt(emailTexts: string[]): string {
  return `You are a data extraction assistant for a household expense tracker.

Extract order data from the following email(s) from Blinkit, Zomato, or Amazon India.

Return ONLY a valid JSON array. No markdown, no explanation, no preamble.

Schema:
[
  {
    "platform": "blinkit" | "zomato" | "amazon",
    "order_date": "YYYY-MM-DD — look for 'Order placed', 'Order date', 'Ordered on' in the body first. For Zomato look for the delivery date. Fall back to EMAIL_DATE only if nothing found in body.",
    "order_ref": "order ID string or null",
    "order_total": number (INR, numeric only),
    "items": [
      { "item_name": "string", "quantity": number, "unit": "kg|g|L|pcs|null", "unit_price": number }
    ],
    "notes": "coupon or discount info or null"
  }
]

Rules:
- Skip emails with no clear order details.
- Dates must be YYYY-MM-DD in IST.
- Do not invent data. Use null if unavailable.
- For Zomato: if item prices not listed, use one item: { item_name: "Food order", quantity: 1, unit: null, unit_price: <total> }
- For Amazon: item prices = individual item price, not order total.
- For Amazon: order date is near text like 'Order Placed', 'Ordered on', or 'Order Date'. Do NOT use shipping or delivery dates.

Emails:
---
${emailTexts.map((t, i) => `EMAIL ${i + 1}:\n${t.slice(0, 6000)}`).join('\n\n---\n\n')}`
}

async function extractOrdersFromEmails(emailTexts: string[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: buildExtractionPrompt(emailTexts) }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API failed: ${res.status}`)
  const data  = await res.json()
  const raw   = data.content?.find((b: any) => b.type === 'text')?.text || '[]'
  const clean = raw.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) }
  catch { console.error('Failed to parse Anthropic response:', clean); return [] }
}

// ─── Save orders ──────────────────────────────────────────────────────────────

async function saveOrders(supabase: any, homeId: string, userId: string, orders: any[]) {
  const saved: any[] = []
  const skipped: any[] = []

  for (const order of orders) {
    if (!order.platform) {
      skipped.push(order); continue
    }
    const orderDate = order.order_date || new Date().toISOString().split('T')[0]
    const orderTotal = order.order_total || 0

    if (order.order_ref) {
      const { data: existing } = await supabase
      .from('expense_orders')
      .select('id, order_date, order_total, notes')
      .eq('home_id', homeId)
      .eq('order_ref', order.order_ref)
      .maybeSingle()
    if (existing) {
      const updates: any = {}
      if (!existing.order_date && order.order_date) updates.order_date = order.order_date
      if (!existing.order_total && order.order_total) updates.order_total = order.order_total
      if (!existing.notes && order.notes) updates.notes = order.notes
      if (Object.keys(updates).length > 0) {
        await supabase.from('expense_orders').update(updates).eq('id', existing.id)
      }
      skipped.push(order); continue
    }
    }

    const category = order.category || 'shopping'

    const newId = crypto.randomUUID()

    const { error: orderErr } = await supabase
      .from('expense_orders')
      .insert({
        id:          newId,
        home_id:     homeId,
        platform:    order.platform,
        category,
        order_date:  orderDate,
        order_ref:   order.order_ref || null,
        order_total: orderTotal,
        notes:       order.notes || null,
        created_by:  userId,
      })

    if (orderErr) {
      throw new Error(`Insert failed: ${JSON.stringify(orderErr)}`)
    }

    const inserted = { id: newId }


    if (order.items?.length) {
      const items = order.items.map((it: any) => ({
        order_id:   inserted.id,
        home_id:    homeId,
        item_name:  it.item_name,
        quantity:   it.quantity || 1,
        unit:       it.unit || null,
        unit_price: it.unit_price || 0,
      }))
      const { error: itemErr } = await supabase.from('expense_order_items').insert(items)
      if (itemErr) console.error('Items insert error:', itemErr)
    }

    saved.push({ ...inserted, items: order.items })
  }

  return { saved, skipped }
}

// ─── Core sync logic (shared) ─────────────────────────────────────────────────

async function runSync(
  supabase: any,
  conn: { id: string; refresh_token: string; last_synced_at: string | null },
  homeId: string,
  userId: string,
  daysBackOverride?: number
) {
  let daysBack = daysBackOverride ?? (
    !conn.last_synced_at ? 90 :
    Math.ceil((Date.now() - new Date(conn.last_synced_at).getTime()) / (1000 * 60 * 60 * 24)) + 1
  )

  const accessToken = await refreshAccessToken(conn.refresh_token)
  const { data: emailSources } = await supabase
    .from('expense_email_sources')
    .select('sender_email')
    .eq('home_id', homeId)
    .eq('is_active', true)
  const knownSenders = (emailSources || []).map((s: any) => s.sender_email)
  if (!knownSenders.length) return { new_orders: 0, skipped: 0, message: 'No email sources configured' }
  const messages    = await searchEmails(accessToken, buildGmailQuery(daysBack, knownSenders), 10)

  if (!messages.length) {
    await supabase.from('home_gmail_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
    return { new_orders: 0, skipped: 0, message: 'No order emails found' }
  }

  // Look up sender → category mapping for this home
  const { data: sources } = await supabase
    .from('expense_email_sources')
    .select('sender_email, platform, category')
    .eq('home_id', homeId)
    .eq('is_active', true)

  const sourceMap: Record<string, { platform: string, category: string }> = {}
  for (const s of sources || []) {
    sourceMap[s.sender_email] = { platform: s.platform, category: s.category }
  }

  const emailPayloads: { text: string, platform: string, category: string }[] = []
    const noMatchSenders: string[] = []
    for (const msg of messages) {
      const { body, sentDate, senderEmail } = await fetchEmailBody(accessToken, msg.id)
      if (!body) continue
      const source = senderEmail ? sourceMap[senderEmail] : null
      if (!source) {
        noMatchSenders.push(senderEmail || 'unknown')
        continue
      }
    const text = sentDate ? `EMAIL_DATE: ${sentDate}\n\n${body}` : body
    emailPayloads.push({ text, platform: source.platform, category: source.category })
  }

  if (!emailPayloads.length) {
    return { new_orders: 0, skipped: 0, message: 'No readable email content' }
  }

  const CHUNK_SIZE = 5
  let extracted: any[] = []
  for (let i = 0; i < emailPayloads.length; i += CHUNK_SIZE) {
    const chunk = emailPayloads.slice(i, i + CHUNK_SIZE)
    const results = await extractOrdersFromEmails(chunk.map(e => e.text))
    extracted = extracted.concat(results)
    if (i + CHUNK_SIZE < emailPayloads.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  const enriched = extracted.map((order: any) => ({
    ...order,
    category: order.platform === 'zomato' ? 'restaurant'
            : order.platform === 'amazon' ? 'shopping'
            : order.platform === 'blinkit' ? 'grocery'
            : order.platform === 'nykaa' || order.platform === 'nykaa man' ? 'shopping'
            : 'shopping',
  }))

  const { saved, skipped } = await saveOrders(supabase, homeId, userId, enriched)

  await supabase.from('home_gmail_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)

  return {
    new_orders: saved.length,
    skipped:    skipped.length,
    message:    `Found ${extracted.length} orders, saved ${saved.length}, skipped ${skipped.length} duplicates`,
  }
}

async function runHistorySync(
  supabase: any,
  conn: { id: string; refresh_token: string },
  homeId: string,
  userId: string,
  pageToken?: string,
) {
  const accessToken = await refreshAccessToken(conn.refresh_token)
  const { data: emailSources } = await supabase
    .from('expense_email_sources')
    .select('sender_email')
    .eq('home_id', homeId)
    .eq('is_active', true)
  const knownSenders = (emailSources || []).map((s: any) => s.sender_email)
  if (!knownSenders.length) return { pages: 0, new_orders: 0 }
  const query = buildGmailQuery(90, knownSenders)

  const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=10${pageToken ? `&pageToken=${pageToken}` : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status}`)
  const data = await res.json()

  const messages: { id: string }[] = data.messages || []
  const nextPageToken = data.nextPageToken || null


  if (!messages.length) {
    await supabase.from('home_gmail_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
    return { new_orders: 0, skipped: 0, next_page_token: null, done: true }
  }

  // Look up sender → category mapping for this home
  const { data: sources } = await supabase
    .from('expense_email_sources')
    .select('sender_email, platform, category')
    .eq('home_id', homeId)
    .eq('is_active', true)

  const sourceMap: Record<string, { platform: string, category: string }> = {}
  for (const s of sources || []) {
    sourceMap[s.sender_email] = { platform: s.platform, category: s.category }
  }

  const emailPayloads: { text: string, platform: string, category: string }[] = []
  const noMatchSenders: string[] = []
  for (const msg of messages) {
    const { body, sentDate, senderEmail } = await fetchEmailBody(accessToken, msg.id)
    if (!body) { noMatchSenders.push(`no-body:${senderEmail}`); continue }
    const source = senderEmail ? sourceMap[senderEmail] : null
    if (!source) {
      noMatchSenders.push(senderEmail || 'unknown')
      continue
    }
    // skip emails from unknown senders
    const text = sentDate ? `EMAIL_DATE: ${sentDate}\n\n${body}` : body
    emailPayloads.push({ text, platform: source.platform, category: source.category })
  }

  let saved: any[] = []
  let skipped: any[] = []
  if (emailPayloads.length) {
    const CHUNK_SIZE = 5
    let extracted: any[] = []
    for (let i = 0; i < emailPayloads.length; i += CHUNK_SIZE) {
      const chunk = emailPayloads.slice(i, i + CHUNK_SIZE)
      const results = await extractOrdersFromEmails(chunk.map(e => e.text))
      extracted = extracted.concat(results)
      if (i + CHUNK_SIZE < emailPayloads.length) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    const enriched = extracted.map((order: any) => ({
      ...order,
      category: order.platform === 'zomato' ? 'restaurant'
              : order.platform === 'amazon' ? 'shopping'
              : order.platform === 'blinkit' ? 'grocery'
              : order.platform === 'nykaa' || order.platform === 'nykaa man' ? 'shopping'
              : 'shopping',
    }))
    const result = await saveOrders(supabase, homeId, userId, enriched)
    saved = result.saved
    skipped = result.skipped
  }

  if (!nextPageToken) {
    await supabase.from('home_gmail_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
  }

  return {
    new_orders:      saved.length,
    skipped:         skipped.length,
    next_page_token: nextPageToken,
    done:            !nextPageToken,
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleConnect(supabase: any, body: any, userId: string) {
  console.log('[handleConnect] called, userId:', userId)
  const { code, home_id, redirect_uri } = body
  if (!code || !home_id || !redirect_uri) throw new Error('Missing code, home_id, or redirect_uri')

  const tokens = await exchangeCodeForTokens(code, redirect_uri)
  if (!tokens.refresh_token) throw new Error('No refresh token — ensure access_type=offline and prompt=consent in OAuth URL')

  // Get the Gmail address from Google
  const userinfoRes  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const userinfo     = userinfoRes.ok ? await userinfoRes.json() : {}
  console.log('[handleConnect] userinfoRes status:', userinfoRes.status, 'ok:', userinfoRes.ok)
  const gmailAddress = userinfo.email || null
  console.log('[handleConnect] userinfo:', JSON.stringify(userinfo), 'gmailAddress:', gmailAddress)

  // Upsert — one row per (home_id, user_id)
  const { error } = await supabase
      .from('home_gmail_connections')
      .upsert({
        home_id:        home_id,
        user_id:        userId,
        gmail_address:  gmailAddress,
        refresh_token:  tokens.refresh_token,
        last_synced_at: null,
        connected_at:   new Date().toISOString(),
      }, { onConflict: 'home_id,user_id', ignoreDuplicates: false })
    if (error) throw error
    // Explicitly update gmail_address in case upsert didn't set it
    await supabase
      .from('home_gmail_connections')
      .update({ gmail_address: gmailAddress })
      .eq('home_id', home_id)
      .eq('user_id', userId)

  // Get the connection we just upserted so we can pass it to runSync
  const { data: conn } = await supabase
    .from('home_gmail_connections')
    .select('id, refresh_token, last_synced_at')
    .eq('home_id', home_id)
    .eq('user_id', userId)
    .single()

  // First sync — last 90 days
  const syncResult = await runSync(supabase, conn, home_id, userId, 90)

  return {
    connected:     true,
    gmail_address: gmailAddress,
    first_sync:    syncResult,
  }
}

async function handleSync(supabase: any, body: any, userId: string) {
  const { home_id } = body

  const { data: conn, error } = await supabase
    .from('home_gmail_connections')
    .select('id, refresh_token, last_synced_at')
    .eq('home_id', home_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !conn) throw new Error('Gmail not connected for this user')
  return runSync(supabase, conn, home_id, userId)
}

async function handleSyncAll(supabase: any, body: any) {
  // Called by pg_cron — syncs ALL member connections for a home
  const { home_id } = body

  const { data: connections, error } = await supabase
    .from('home_gmail_connections')
    .select('id, user_id, refresh_token, last_synced_at')
    .eq('home_id', home_id)

  if (error) throw error
  if (!connections?.length) return { message: 'No Gmail connections for this home', results: [] }

  const results = []
  for (const conn of connections) {
    try {
      const result = await runSync(supabase, conn, home_id, conn.user_id)
      results.push({ user_id: conn.user_id, ...result })
    } catch (err: any) {
      results.push({ user_id: conn.user_id, error: err.message })
    }
  }
  return { results }
}

async function handleDisconnect(supabase: any, body: any, userId: string) {
  const { home_id } = body
  const { error } = await supabase
    .from('home_gmail_connections')
    .delete()
    .eq('home_id', home_id)
    .eq('user_id', userId)
  if (error) throw error
  return { message: 'Gmail disconnected' }
}

async function handleStatus(supabase: any, body: any, userId: string) {
  const { home_id } = body
  const { data } = await supabase
    .from('home_gmail_connections')
    .select('gmail_address, connected_at, last_synced_at')
    .eq('home_id', home_id)
    .eq('user_id', userId)
    .maybeSingle()

  return {
    connected:      !!data,
    gmail_address:  data?.gmail_address || null,
    connected_at:   data?.connected_at || null,
    last_synced_at: data?.last_synced_at || null,
  }
}
async function handleSyncHistory(supabase: any, body: any, userId: string) {
  const { home_id, page_token } = body
  const { data: conn, error } = await supabase
    .from('home_gmail_connections')
    .select('id, refresh_token')
    .eq('home_id', home_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !conn) throw new Error('Gmail not connected for this user')
  return runHistorySync(supabase, conn, home_id, userId, page_token)
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabase = getAdminClient()

    const body = await req.json()      // ← move this UP

    const token = authHeader.replace('Bearer ', '')
    const base64Payload = token.split('.')[1]
    const payload = JSON.parse(atob(base64Payload))
    const userId = payload.sub || body.user_id    // ← add fallback
    if (!userId) throw new Error('Unauthorized')

    const user = { id: userId }

    const action = body.action

    let result
    switch (action) {
      case 'connect':    result = await handleConnect(supabase, body, user.id);    break
      case 'sync':       result = await handleSync(supabase, body, user.id);       break
      case 'sync-all':   result = await handleSyncAll(supabase, body);             break
      case 'sync-history': result = await handleSyncHistory(supabase, body, user.id); break
      case 'disconnect': result = await handleDisconnect(supabase, body, user.id); break
      case 'status':     result = await handleStatus(supabase, body, user.id);     break
      default:           throw new Error(`Unknown action: ${action}`)
      
    }

    return new Response(JSON.stringify(result), {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Edge Function error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
