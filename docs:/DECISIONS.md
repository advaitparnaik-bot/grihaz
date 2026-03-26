# Grihaz — Decisions & Parked Features Log

*Last updated: March 2026*

---

## Parked for Post-MVP

### 1. Terminated Staff — Auto-Delete After 12 Months
- Terminated staff are soft-deleted (active = false) and retained in DB
- A backend job should purge terminated staff records older than 12 months
- All related attendance and payout records should be purged with them
- **Trigger:** After MVP launch, before first external households hit 12-month mark

---

### 2. On Leave — Extended Leave Management
- On leave is a staff *status*, distinct from daily Absent (Paid/Unpaid)
- When marking extended leave, capture:
  - From date
  - To date
  - Paid or Unpaid
- During leave period, staff should be pre-marked in attendance (not require daily input)
- At month-end payout, leave days are calculated as paid or unpaid per the leave record
- **Dependency:** Requires leave_periods table: `id, staff_id, home_id, from_date, to_date, type (paid/unpaid), created_by, created_at`

---

### 3. Salary Increment History
- When a staff member's rate is updated, the old rate must be preserved
- Old rate applies to all past months, new rate applies from the effective date forward
- Payout calculation must reference rate history, not just current rate
- **Dependency:** Requires salary_history table: `id, staff_id, pay_type, monthly_rate, daily_rate, effective_from, created_by, created_at`
- MVP workaround: rate changes overwrite current rate; history tracking parked

---

### 4. Settlement / Payment Recording
- After monthly payout is calculated, homeowner should be able to mark it as settled
- Per settlement record, capture:
  - Month (year + month)
  - Staff member
  - Amount paid
  - Mode of payment: Cash / UPI / Bank Transfer
  - Date of payment
  - Notes (optional)
- Settlements should appear in payout history view
- **Dependency:** Requires settlements table: `id, staff_id, home_id, month, amount, mode (cash/upi/bank), payment_date, notes, created_by, created_at`

---

### 5. Laundry Tracker (Phase 2 — already in brief)
- Log clothes given to laundry: category, service type, quantity, price per item
- Mark items returned or pending
- Monthly laundry settlement view
- Rates to be saved per service type

---

### 6. Terminated Staff Deleted After 12 Months (Backend Job)
- See item 1 above

---

### 7. Service Provider Login (Phase 3 — already in brief)
- Staff can view their own attendance and payment records
- Behavioural change in domestic worker demographic too difficult for MVP

---

### 8. IoT / Fingerprint Scanner (Phase 3 — already in brief)
- Too complex and expensive for MVP target market

---

## MVP Build Tracker

### ✅ Done
- Supabase setup — all 6 tables, RLS policies
- Magic link auth
- Login screen
- Create Home flow
- Dashboard — attendance marking (P / AP / A), save to Supabase
- Add Staff — Fixed Monthly, Per Day, Per Visit, schedule picker
- Staff Management page — view, edit rate, terminate with last working date validation, reactivate
- Bottom nav — Home + Staff tabs

### 🔲 In Progress / Up Next
- Attendance testing — Per Day Rate staff, Per Visit staff, AP and A flows, status update (no duplicate rows)
- Adhoc entries — one-off payment or deduction per staff, custom amount + note + date
- Add member to home — invite spouse or family member via email
- Monthly payout view — per-staff calculated payout, total household, mark as paid

### 🔲 Remaining MVP
- Settlement recording — mode (Cash/UPI/Bank), date, amount per month per staff
- RLS policies — tighten before public launch

---

## MVP Scope Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Magic link only | Simple, no password management |
| Pay structures | Fixed Monthly, Per Day, Per Visit | Covers all common domestic staff arrangements |
| Adhoc entries | Custom amount + note, no predefined rate | Flexibility for out-of-schedule work |
| Staff termination | Soft delete (active = false) + last working date | Retain for payroll history |
| On leave (MVP) | Not in MVP | Parked — see above |
| Salary history (MVP) | Not in MVP | Overwrite rate for now |
| Settlement recording | In MVP | Needed for complete payroll flow |
| RLS policies | Permissive for authenticated users | To be tightened before public launch |
| Laundry tracker | Phase 2 | After core attendance and payroll stable |
## User Profile Page
**Status:** Parked — Post-MVP

Full profile page (name, phone, address) for each home member. 
Audit trail (who created which entry) already exists via `created_by` 
field on all tables. Surface this in the UI and build full profile 
management in Phase 2 once multi-member usage is validated.
