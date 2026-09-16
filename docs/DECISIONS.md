# Grihaz — Decisions & Parked Features Log

*Last updated: September 2026*

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
| Anthropic model | claude-sonnet-4-6 | claude-sonnet-4-20250514 returned 404 |
| Email sender | noreply@rhyea.com | Resend free tier. Upgrade to noreply@grihazhome.com pending domain migration. |
| Dev testing | *.pages.dev URL | Custom domains always map to Cloudflare Production env |
| Supabase branching | Two free projects | Manual migration sync required |
| expense_platform_category | PostgreSQL enum | Adding new categories requires ALTER TYPE + code change |
| Settle tab staff filter | Fetch all staff, filter by contract activity | Shows terminated staff in months they were active; new staff don't appear in pre-contract months |
| Laundry Ledger filter | closed_at | Return date is more relevant than drop-off date for period filtering |

---

## Pending Items

- [ ] grihazhome.com domain migration (app → app.grihazhome.com, marketing → grihazhome.com)
- [ ] Resend domain setup for noreply@grihazhome.com (fixes OTP spam issue)
- [ ] Google OAuth verification (submitted, under review)
- [ ] Eddie display name "Adie (Eddiekt)" needs update in prod
- [ ] grihaz.in and grihazhome.in redirects to grihazhome.com
