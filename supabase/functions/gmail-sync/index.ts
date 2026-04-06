// supabase/functions/gmail-sync/index.ts
// Grihaz — Gmail Sync Edge Function
// Handles Gmail OAuth token exchange, email fetching,
// Anthropic extraction, deduplication, and saving to Supabase.
//
// Endpoints:
//   POST /gmail-sync          { action: 'connect', code, home_id }
//   POST /gmail-sync          { action: 'sync', home_id }
//   POST /gmail-sync          { action: 'disconnect', home_id }
//   POST /gmail-sync          { action: 'status', home_id }
//
// Secrets required (set in Supabase Edge Function Secrets):
//   ANTHROPIC_API_KEY
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   APP_URL
//
// Built-in Supabase secrets (automatic, no setup needed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY       = Deno.env.get('ANTHROPIC_API_KEY')!
const GOOGLE_CLIENT_ID        = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET    = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const APP_URL                 = Deno.env.get('APP_URL')!

const GMAIL_REDIRECT_URI      = `${APP_URL}/auth/gmail/callback`
const GMAIL_TOKEN_URL         = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE          = 'https://gmail.googleapis.com/gmail/v1/users/me'

const KNOWN_SENDERS = [
  'no-reply@blinkit.com',
  'orders@blinkit.com',
  'noreply@zomato.com',
  'no-reply@zomato.com',
  'order-update@amazon.in',
  'shipment-tracking@amazon.in',
  'auto-confirm@amazon.in',
]

// ─── CORS Headers ────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ─── Supabase admin client ────────────────────────────────────────────────────

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })
}

// ─── Google OAuth helpers ─────────────────────────────────────────────────────

async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GMAIL_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }
  return res.json()
}

async function refreshAccessToken(refreshToken: string) {
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
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }
  const data = await res.json()
  return data.access_token as string
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

function buildGmailQuery(daysBack: number): string {
  const after    = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const dateStr  = after.toISOString().split('T')[0].replace(/-/g, '/')
  const from     = KNOWN_SENDERS.map(s => `from:${s}`).join(' OR ')
  return `(${from}) after:${dateStr}`
}

async function searchEmails(accessToken: string, query: string, maxResults = 50) {
  const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status}`)
  const data = await res.json()
  return (data.messages || []) as { id: string }[]
}

async function fetchEmailBody(accessToken: string, messageId: string): Promise<string> {
  const url = `${GMAIL_API_BASE}/messages/${messageId}?format=full`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return ''
  const data = await res.json()

  // Extract plain text or HTML body
  function extractBody(payload: any): string {
    if (!payload) return ''
    if (payload.body?.data) {
      return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const text = extractBody(part)
        if (text) return text
      }
    }
    return ''
  }

  return extractBody(data.payload)
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
    "order_date": "YYYY-MM-DD",
    "order_ref": "order ID string or null",
    "order_total": number (INR, numeric only),
    "items": [
      {
        "item_name": "string",
        "quantity": number,
        "unit": "kg | g | L | pcs | null",
        "unit_price": number
      }
    ],
    "notes": "coupon or discount info or null"
  }
]

Rules:
- Skip emails with no clear order details.
- Dates must be YYYY-MM-DD in IST.
- Do not invent data. Use null if unavailable.
- For Zomato: if individual item prices are not listed, use one item: { item_name: "Food order", quantity: 1, unit: null, unit_price: <total> }
- For Amazon: item prices = individual item price, not order total.

Emails:
---
${emailTexts.map((t, i) => `EMAIL ${i + 1}:\n${t.slice(0, 3000)}`).join('\n\n---\n\n')}`
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
  try {
    return JSON.parse(clean)
  } catch {
    console.error('Failed to parse Anthropic response:', clean)
    return []
  }
}

// ─── Save orders to Supabase ──────────────────────────────────────────────────

async function saveOrders(supabase: any, homeId: string, userId: string, orders: any[]) {
  const saved: any[] = []
  const skipped: any[] = []

  for (const order of orders) {
    if (!order.platform || !order.order_date || !order.order_total) {
      skipped.push(order)
      continue
    }

    // Deduplication check
    if (order.order_ref) {
      const { data: existing } = await supabase
        .from('expense_orders')
        .select('id')
        .eq('home_id', homeId)
        .eq('order_ref', order.order_ref)
        .maybeSingle()

      if (existing) {
        skipped.push(order)
        continue
      }
    }

    // Determine category
    const category =
      order.platform === 'blinkit' ? 'grocery' :
      order.platform === 'zomato'  ? 'food_delivery' :
      'shopping'

    // Insert order
    const { data: inserted, error: orderErr } = await supabase
      .from('expense_orders')
      .insert({
        home_id:     homeId,
        platform:    order.platform,
        category,
        order_date:  order.order_date,
        order_ref:   order.order_ref || null,
        order_total: order.order_total,
        notes:       order.notes || null,
        created_by:  userId,
      })
      .select()
      .single()

    if (orderErr) {
      console.error('Order insert error:', orderErr)
      skipped.push(order)
      continue
    }

    // Insert items
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

// ─── Action handlers ──────────────────────────────────────────────────────────

// CONNECT: exchange OAuth code for tokens, store refresh token
async function handleConnect(supabase: any, body: any, userId: string) {
  const { code, home_id } = body
  if (!code || !home_id) throw new Error('Missing code or home_id')

  const tokens = await exchangeCodeForTokens(code)
  if (!tokens.refresh_token) throw new Error('No refresh token returned — ensure access_type=offline in OAuth request')

  // Upsert connection
  const { error } = await supabase
    .from('home_gmail_connections')
    .upsert({
      home_id:       home_id,
      user_id:       userId,
      refresh_token: tokens.refresh_token,
      last_synced_at: null,
      connected_at:  new Date().toISOString(),
    }, { onConflict: 'home_id' })

  if (error) throw error

  // Immediately trigger first sync (last 90 days)
  return handleSync(supabase, { home_id, days_back: 90 }, userId, true)
}

// SYNC: fetch emails, extract orders, save new ones
async function handleSync(supabase: any, body: any, userId: string, isFirstRun = false) {
  const { home_id } = body

  // Get connection
  const { data: conn, error: connErr } = await supabase
    .from('home_gmail_connections')
    .select('refresh_token, last_synced_at')
    .eq('home_id', home_id)
    .maybeSingle()

  if (connErr || !conn) throw new Error('Gmail not connected for this home')

  // Determine lookback
  let daysBack = 1
  if (!conn.last_synced_at || body.days_back) {
    daysBack = body.days_back || 90
  } else {
    const lastSync  = new Date(conn.last_synced_at)
    const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)
    daysBack = Math.ceil(hoursSince / 24) + 1
  }

  // Get fresh access token
  const accessToken = await refreshAccessToken(conn.refresh_token)

  // Search Gmail
  const query    = buildGmailQuery(daysBack)
  const messages = await searchEmails(accessToken, query, 50)

  if (!messages.length) {
    // Update last_synced_at even if no emails found
    await supabase
      .from('home_gmail_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('home_id', home_id)
    return { new_orders: [], skipped: 0, message: 'No order emails found' }
  }

  // Fetch email bodies (limit to 20 per sync to manage costs)
  const emailTexts: string[] = []
  for (const msg of messages.slice(0, 20)) {
    const body = await fetchEmailBody(accessToken, msg.id)
    if (body) emailTexts.push(body)
  }

  if (!emailTexts.length) {
    return { new_orders: [], skipped: 0, message: 'No readable email content' }
  }

  // Extract orders via Anthropic
  const extracted = await extractOrdersFromEmails(emailTexts)

  // Save to Supabase
  const { saved, skipped } = await saveOrders(supabase, home_id, userId, extracted)

  // Update last_synced_at
  await supabase
    .from('home_gmail_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('home_id', home_id)

  return {
    new_orders:  saved,
    skipped:     skipped.length,
    is_first_run: isFirstRun,
    message:     `Found ${extracted.length} orders, saved ${saved.length}, skipped ${skipped.length} duplicates`,
  }
}

// DISCONNECT: remove Gmail connection
async function handleDisconnect(supabase: any, body: any) {
  const { home_id } = body
  const { error } = await supabase
    .from('home_gmail_connections')
    .delete()
    .eq('home_id', home_id)
  if (error) throw error
  return { message: 'Gmail disconnected' }
}

// STATUS: check connection status
async function handleStatus(supabase: any, body: any) {
  const { home_id } = body
  const { data } = await supabase
    .from('home_gmail_connections')
    .select('connected_at, last_synced_at')
    .eq('home_id', home_id)
    .maybeSingle()

  return {
    connected:      !!data,
    connected_at:   data?.connected_at || null,
    last_synced_at: data?.last_synced_at || null,
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    // Verify auth — get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabase  = getSupabase()
    const userToken = authHeader.replace('Bearer ', '')

    // Verify the user token and get user
    const { data: { user }, error: authErr } = await createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (authErr || !user) throw new Error('Unauthorized')

    const body   = await req.json()
    const action = body.action

    let result
    switch (action) {
      case 'connect':    result = await handleConnect(supabase, body, user.id);    break
      case 'sync':       result = await handleSync(supabase, body, user.id);       break
      case 'disconnect': result = await handleDisconnect(supabase, body);          break
      case 'status':     result = await handleStatus(supabase, body);              break
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
