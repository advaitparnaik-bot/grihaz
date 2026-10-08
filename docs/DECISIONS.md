# Grihaz — Decisions & Parked Features Log

*Last updated: 8 October 2026*

Open work lives in [`BACKLOG.md`](BACKLOG.md). This file records what shipped, what's parked, and why things are the way they are.

---

## Shipped Features

### ✅ Phase 1 — Core Attendance & Payroll
- OTP auth via Supabase (replaced magic link August 2026)
- Create Home + invite members via ?invite= link
- Staff management — add, edit, terminate, reactivate
- Daily attendance marking (P / AP / A) with calendar view
- Adhoc entries — one-off payments or deductions
- Monthly payout calculation (Fixed Monthly, Per Day Rate, Per Visit)
- Settlement recording — Cash / UPI, per staff per month
- Multi-member homes — invite flow, member visibility via get_my_home_id()
- Contract start date visible on staff cards ("Since [date]")
- Settle tab shows terminated staff in months they were active; hides them in months before contract start

### ✅ Phase 2 — Laundry Tracker
- Log drop-offs by category, service type, quantity, unit price
- Mark items returned. Monthly laundry settlement view.
- Laundry rate card per home
- Partial settlement — "Settle remaining ₹X" CTA when new entries added after partial payment
- Ledger filters laundry by closed_at (return date) not created_at (drop-off date)

### ✅ Phase 3 (Partial) — Household Expense Tracking
- Gmail OAuth integration per home member
- Supported platforms: Blinkit, Zomato, Amazon, Nykaa, Urban Company (Home Services)
- Nightly pg_cron sync (00:30 UTC) via sync-all Edge Function
- Ledger tab — member filter + attribution labels
- Settle tab — per-member expense breakdown
- Install App section in Profile (Android + iOS)
- Home Services expense category added (enum: home_services)

### ✅ Domains & Website (October 2026)
- App moved to app.grihazhome.com; staging on staging.grihazhome.com
- Public website at grihazhome.com (separate repo `grihaz-site`): homepage, privacy policy, terms
- grihaz.in, grihazhome.in, www.grihazhome.com redirect to grihazhome.com; old grihaz.rhyea.com and staging-grihaz.rhyea.com redirect to app.grihazhome.com
- hello@grihazhome.com contact address
- Google OAuth branding verification approved and published

---

## Parked for Post-MVP

### 1. Terminated Staff — Auto-Delete After 12 Months
- Soft-deleted (active = false). Backend purge job needed after 12 months.

### 2. On Leave — Extended Leave Management
- Dependency: leave_periods table

### 3. Salary Increment History
- Dependency: salary_history table. MVP workaround: rate changes overwrite current rate.

### 4. Service Provider Login
- Behavioural change in domestic worker demographic too difficult for MVP.

### 5. IoT / Fingerprint Scanner
- Too complex and expensive for MVP.

### 6. Household Expenditure Optimisation
- Requires sufficient data history first.

### 7. Multi-app Dashboard under Rhyea Brand

---

## Active Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth | OTP (6-digit code) | Magic links open in browser not PWA. OTP entered directly in app — session stays in PWA context. |
| OTP length | 6 digits | Changed from Supabase default of 8 |
| Invite param | ?invite= | Avoids conflict with Supabase magic link ?token= param |
| RLS cross-member | get_my_home_id() security definer | Avoids circular RLS dependency |
| Gmail sync | sync-all + pg_cron | Single nightly call. Vault secrets authenticate. |
| Gmail redirect URI | Built from `window.location.origin` in the frontend; Edge Function uses the URI sent in the request | Works on any domain registered in the Google OAuth client. `APP_URL` / `GMAIL_REDIRECT_URI` in gmail-sync are unused. |
| Anthropic model | claude-sonnet-4-6 | claude-sonnet-4-20250514 returned 404 |
| Email sender | noreply@rhyea.com (for now) | Shared Resend free account with Suraksha. Moving Grihaz to Brevo or ZeptoMail on grihazhome.com — a second free Resend account would break Resend's Acceptable Use Policy. |
| Domains | grihazhome.com primary | grihaz.com too expensive. grihaz.in / grihazhome.in are redirects. Registered at GoDaddy, DNS on Cloudflare. |
| App vs marketing site | app.grihazhome.com (app) + grihazhome.com (site, separate repo and Pages project) | Site changes never touch app deploys. Real homepage needed for Google verification, ad traffic and email reputation. |
| Staging environment | staging.grihazhome.com → CNAME `staging.grihaz.pages.dev` | Branch alias runs the Preview env (dev Supabase). A custom domain pointed at `grihaz.pages.dev` serves Production — the old staging-grihaz.rhyea.com did this and was running against prod. |
| Pages environment variables | Production → grihaz-prod; Preview → grihaz-dev | Preview needs every `VITE_` var Production has (incl. `VITE_GOOGLE_CLIENT_ID`). Vars are baked in at build — redeploy after changing them. |
| Old domain redirects | Cloudflare Redirect Rules (301), edge only | No in-app redirect needed: only one active user at migration time. |
| Contact email | hello@grihazhome.com | Cloudflare Email Routing → Gmail. Free. |
| Gmail scope | gmail.readonly (restricted) | Branding verified. Data-access verification needs annual CASA — deferred; receipt-forwarding is the alternative. |
| Supabase branching | Two free projects | Manual migration sync required |
| expense_platform_category | PostgreSQL enum | Adding new categories requires ALTER TYPE + code change |
| Settle tab staff filter | Fetch all staff, filter by contract activity | Shows terminated staff in months they were active; new staff don't appear in pre-contract months |
| Laundry Ledger filter | closed_at | Return date is more relevant than drop-off date for period filtering |

---

## Decision History

### 8 Oct 2026 — Domain migration to grihazhome.com
- **Domains.** grihazhome.com is the primary domain. App at app.grihazhome.com, marketing site at grihazhome.com, staging at staging.grihazhome.com. grihaz.in and grihazhome.in redirect to grihazhome.com.
- **Staging was pointing at prod.** staging-grihaz.rhyea.com's CNAME targeted `grihaz.pages.dev`, so it served the main build against prod Supabase. Likely left over from when dev and prod shared one database. Fixed by pointing the new staging domain at the branch alias. Dev Supabase Site URL also pointed at the old staging domain; now staging.grihazhome.com.
- **Preview env was missing `VITE_GOOGLE_CLIENT_ID`**, so Gmail connect on real staging sent `client_id=undefined`. Earlier Gmail testing on dev had worked only from localhost. Also removed a trailing dot from Preview `VITE_SUPABASE_URL`.
- **Marketing site is a separate repo** (`grihaz-site`), plain HTML/CSS, no build step.
- **Email.** Grihaz moves off the shared Resend account (AUP forbids extra free accounts to get around limits). Suraksha stays on Resend with rhyea.com.
- **Google verification.** Earlier branding submission was rejected (thin privacy policy, homepage didn't explain the app, app name mismatch). Resubmitted with grihazhome.com homepage, a detailed privacy policy with a Limited Use statement, and terms — approved and published 8 Oct 2026.