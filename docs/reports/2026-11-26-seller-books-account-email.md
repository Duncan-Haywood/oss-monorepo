---
kind: brief
date: 2026-11-26
subjects: [reseller-books]
title: Seller Books account email and durable auth limits, ported from PayApps
description: Handover for private PR 214 (bet #5): email verification, password reset and D1 auth rate limits, and what the deploy must set.
---

# Seller Books: account email and auth limits (private PR 214, bet #5)

Date: 2026-11-26. Explore run.

**Why.** `apps/seller-books/docs/ARCHITECTURE.md` "Gaps / next" listed "no
email provider yet, so there is no email verification and no password
reset". Without them a stranger cannot sign up safely: anyone could register
an address they do not own, and a forgotten password was a dead account.
`apps/payapps` already had the whole stack, so this was a port, not a design.

**What landed** (`private-monorepo` PR 214):

- `src/worker/ports/email.ts` (Cloudflare Email Service via the `EMAIL`
  `send_email` binding plus `EMAIL_FROM`; in-memory fake in tests and the
  offline demo; log-only otherwise). `/api/health` reports `email`.
- Better Auth wiring in `services/auth/auth.ts` + `emails.ts`: verification
  required on production/HTTPS, 1-hour single-use reset that revokes every
  session, the "you already have an account" notice, per-user send throttles.
- `middleware/auth-rate-limit.ts`: per-IP and per-account (failed sign-ins
  only) limits in D1, in front of Better Auth's per-isolate limiter.
- Client pages `/forgot-password`, `/reset-password`, `/verify-email`; "Check
  your email" after sign-up; resend on `EMAIL_NOT_VERIFIED`. The client's
  `api.ts` now reads Better Auth's `{ code, message }` error shape, so
  sign-in errors show their real message instead of the HTTP status text.
- Seller Books invitations are links the admin shares (payapps emails them).
  A user who signs up from one used to lose the link at the confirmation
  step; the sign-up page now saves its `next` path in `sessionStorage` and
  the "Email confirmed" page continues there.
- Privacy Policy now names Cloudflare as the sender of account emails;
  `POLICY_VERSION` is `2026-11-26.2`, so every user re-accepts. The previous
  handover (`2026-11-26-seller-books-legal-pages.md`) listed "no email
  provider" as a fact the policy rested on; that fact changed here.

No migration: every counter lives in the existing `verification` table.

**For the deploy (still missing for this app).** Set `EMAIL_FROM` (for
example `Seller Books <no-reply@marisstella.app>`, the domain is already
onboarded for grants) and check `GET /api/health` answers `"email": true`.
With `false` on HTTPS nobody can finish signing up: treat it as a failed
deploy (`apps/seller-books/docs/EMAIL.md`).

**Next for the bet.** A `seller-books-deploy` workflow (BILLING.md "Turning
it on", step 2, with the Paddle catalog sync and `EMAIL_FROM`); then real
exports per platform to replace the hand-written importer fixtures
(`docs/IMPORTERS.md`).
