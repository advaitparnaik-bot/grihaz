# Grihaz backlog

Open work, newest decisions first. Update this file as items move: tick them off, move them to **Done**, and record decisions in `DECISIONS.md`.

_Last updated: 8 Oct 2026_

## Now

- [ ] **Move OTP email off the shared Resend account.** Grihaz and Suraksha both send from `noreply@rhyea.com` on one Resend account; OTPs land in spam. Move Grihaz to Brevo (free, 300/day) or ZeptoMail on `grihazhome.com`. Settings-only change in Supabase SMTP (dev, then prod); no code calls Resend.
  - Edit the existing SPF record on grihazhome.com (`v=spf1 include:_spf.mx.cloudflare.net ~all`) to add the provider. Never add a second SPF record.
  - Update the privacy policy's provider list on grihazhome.com when switching.
- [ ] **Check Google Auth Platform → Audience → publishing status.** In "Testing", Google expires refresh tokens after 7 days, which silently breaks Gmail sync.
- [ ] **Update GRIHAZ-BRIEF to v1.9** with the domain migration and website.
- [ ] **Eddie's display name** shows as "Adie (Eddiekt)" in prod; update it.

## Gmail / Google verification

- [x] Branding verification approved and published (8 Oct 2026).
- [ ] **Data access verification.** `gmail.readonly` is a restricted scope: users see "Google hasn't verified this app" and Gmail connection is capped at 100 users. Full verification needs an annual third-party security assessment (CASA). Decide between:
  - CASA assessment, or
  - a receipt-forwarding approach (users forward order emails to a Grihaz inbox) that avoids Gmail access.
- [ ] **Revoke the Gmail token at Google on Disconnect.** `handleDisconnect` in `supabase/functions/gmail-sync/index.ts` deletes the `home_gmail_connections` row but doesn't call `https://oauth2.googleapis.com/revoke`. Add the call before the delete.
- [ ] **Encrypt Gmail refresh tokens at rest.** `refresh_token` is plain text in `home_gmail_connections`. Move to Supabase Vault / pgsodium. CASA will ask about this.

## Cleanup (late Oct 2026)

- [ ] Remove `grihaz.rhyea.com` and `staging-grihaz.rhyea.com` from Supabase redirect URLs (dev and prod) and from the `grihaz` Pages project's custom domains. Keep the rhyea.com Redirect Rule until then.
- [ ] Remove `rhyea.com` from Google Auth Platform → Branding → Authorized domains.
- [ ] Delete unused `APP_URL` and `GMAIL_REDIRECT_URI` from `gmail-sync` and the `APP_URL` secret on both projects. The redirect URI comes from the frontend's `window.location.origin`.
- [ ] Remove in-app `src/pages/Privacy.jsx` and `Terms.jsx` (they still say `hello@rhyea.com`); link to `https://grihazhome.com/privacy/` and `/terms/` instead.
- [ ] Replace website screenshots with a demo home (they show real staff names). Same filenames in `grihaz-site/assets/screens/`.

## Done

**8 Oct 2026: domain migration and website**
- App moved to `app.grihazhome.com` (prod Supabase); staging on `staging.grihazhome.com` (CNAME → `staging.grihaz.pages.dev`, dev Supabase).
- Supabase Site URL and redirect URLs updated (dev → staging.grihazhome.com, prod → app.grihazhome.com).
- Google OAuth client: new origins and redirect URIs added; old rhyea and `pages.dev` entries removed.
- Pages Preview env: added `VITE_GOOGLE_CLIENT_ID`; removed trailing dot from `VITE_SUPABASE_URL`.
- FAQ link in `Profile.jsx` made relative (`/faqs`).
- Website live at `grihazhome.com` (repo `grihaz-site`); see its README.
- 301 redirects: `www.grihazhome.com`, `grihaz.in`, `grihazhome.in` → grihazhome.com; `grihaz.rhyea.com`, `staging-grihaz.rhyea.com` → app.grihazhome.com.
- `hello@grihazhome.com` via Cloudflare Email Routing → Gmail.
- `grihazhome.com` verified in Google Search Console.