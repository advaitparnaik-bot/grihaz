# Grihaz — Decisions & Parked Features Log

*Last updated: August 2026*

---

## Shipped Features

### ✅ Phase 1 — Core Attendance & Payroll
- Magic link auth via Supabase
- Create Home + invite members via link
- Staff management — add, edit, terminate, reactivate
- Daily attendance marking (P / AP / A) with calendar view
- Adhoc entries — one-off payments or deductions
- Monthly payout calculation (Fixed Monthly, Per Day Rate, Per Visit)
- Settlement recording — Cash / UPI, per staff per month
- Multi-member homes — invite flow via ?invite= link

### ✅ Phase 2 — Laundry Tracker
- Log drop-offs by category, service type, quantity, unit price
- Mark items returned
- Monthly laundry settlement view
- Laundry rate card per home

### ✅ Phase 3 (Partial) — Household Expense Tracking
- Gmail OAuth integration per home member (gmail.readonly scope)
- Supported platforms: Blinkit, Zomato, Amazon, Nykaa
- Nightly pg_cron sync (00:30 UTC) via sync-all Edge Function
- Ledger tab — full transaction history with cascading filters
- Member filter + attribution ("by [name]") across all transaction types
- Settle tab — per-member expense breakdown + "Settled by [name]"
- Install App section in Profile (Android + iOS instructions)

---

## Parked for Post-MVP

### 1. Terminated Staff — Auto-Delete After 12 Months
- Terminated staff are soft-deleted (active = false) and retained
- A backend job should purge records older than 12 months
- **Trigger:** After first external households hit 12-month mark

### 2. On Leave — Extended Leave Management
- On leave is a staff status distinct from daily Absent (Paid/Unpaid)
- Capture from date, to date, paid or unpaid
- Staff pre-marked during leave period, no daily input needed
- **Dependency:** leave_periods table: `id, staff_id, home_id, from_date, to_date, type (paid/unpaid), created_by, created_at`

### 3. Salary Increment History
- Rate changes should preserve history — old rate for past months, new rate from effective date
- **Dependency:** salary_history table: `id, staff_id, pay_type, monthly_rate, daily_rate, effective_from, created_by, created_at`
- MVP workaround: rate changes overwrite current rate

### 4. Service Provider Login
- Staff can view their own attendance and payment records
- Behavioural change in domestic worker demographic too difficult for MVP

### 5. IoT / Fingerprint Scanner
- Too complex and expensive for MVP target market

### 6. Household Expenditure Optimisation
- Spend trends, insights, monthly household P&L
- Requires sufficient data history first

### 7. Multi-app Dashboard under Rhyea Brand
- Grihaz as one of several Rhyea products in a unified dashboard

---

## Active Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Magic link | Simple, no password management. OTP planned as replacement for easier cross-device testing. |
| Invite param | ?invite= | Changed from ?token= to avoid conflict with Supabase magic link auth token |
| RLS cross-member | get_my_home_id() security definer | Avoids circular RLS dependency when querying home_members to check membership |
| Gmail sync | sync-all Edge Function + pg_cron | Single nightly call loops all home connections. Vault secrets authenticate. |
| Anthropic model | claude-sonnet-4-6 | claude-sonnet-4-20250514 returned 404 |
| Email sender | noreply@rhyea.com | Resend free tier. Upgrade to noreply@grihaz.rhyea.com pending paid tier. |
| Dev testing | *.pages.dev URL | Custom domains always map to Cloudflare Production env. Dev branch only testable via auto-generated URL. |
| Pay structures | Fixed Monthly, Per Day, Per Visit | Covers all common domestic staff arrangements |
| Staff termination | Soft delete (active = false) | Retain for payroll history |
| Supabase branching | Two free projects (grihaz-dev, grihaz-prod) | Instead of paid branching feature. Manual migration sync required. |

---

## Pending Items

- [ ] PWA not working on iPhone — AuthRetryableFetchError status:0
- [ ] Upgrade Resend to noreply@grihaz.rhyea.com for better deliverability
- [ ] Await Google OAuth app verification
- [ ] OTP login to replace magic link
- [ ] ExpensePlatforms UX — edit/add sender emails without removing platform
- [ ] grihaz.com domain purchase when ready to commercialise
