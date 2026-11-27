# Email

Seller Books sends account mail and invitations, all transactional (2026-11-26, ported from apps/payapps):

| Mail | When | Link | Expires |
| --- | --- | --- | --- |
| Confirm your email for Seller Books | sign-up (when verification is required), or "Send a new confirmation link" | `/verify-email?token=` | 24 hours |
| Reset your Seller Books password | "Forgot password?" on the sign-in page | `/reset-password?token=` | 1 hour, single use; a reset signs the user out everywhere and marks the address verified |
| You already have a Seller Books account | sign-up with an address that already has one (the API answers the same as a new sign-up, so it reveals nothing) | `/forgot-password` | n/a |
| You're invited to a shop's books on Seller Books | an admin sends an invitation on the Members page | `/invite?token=` | 7 days; works only for a signed-in user whose email is the invited address |

**Invitations** (2026-11-26, `src/worker/routes/org/members.ts`): the email carries the same one-time link
the API returns, and the Members page still shows it, worded by whether a real sender delivered the mail
(`emailSent`, from the sender's `delivers`), so an admin can share it by hand if the mail does not
arrive. The subject names neither the shop nor the inviter (both typed by customers, so a shop name
cannot be used to write a convincing subject to a stranger); the body does, HTML-escaped. Each shop may
send 20 invitations an hour (`INVITE_EMAIL_THROTTLE`, durable `throttle:invite:<orgId>` window), refused
with a 429 before anything is created. Re-inviting an address revokes its pending invitation (the old
link stops working) and does not count as another seat; a current member is refused with a 409. A
failed send is logged (`invitation.email_failed`, ids only) and never fails the request. Tests:
`test/worker/invitation-email.test.ts`.

Templates and the per-user throttle: `src/worker/services/auth/emails.ts`. Better Auth wiring:
`src/worker/services/auth/auth.ts`. Pages: `src/client/routes/account.tsx` (forgot, reset, verify) and
`src/client/routes/public.tsx` ("Check your email" after sign-up, the resend form when sign-in answers
`EMAIL_NOT_VERIFIED`, the "Forgot password?" link). Tests: `test/worker/auth-email.test.ts`,
`src/worker/ports/email.test.ts`.

**Invitation links survive the confirmation step.** A user who opens an invitation, signs up and then
confirms the address (perhaps in another tab, from their mail app) would otherwise land on the shop list
and lose the link. The sign-up page saves its `next` path (same-origin paths only) in `sessionStorage`,
and the "Email confirmed" page's Continue button goes there. In a different browser it falls back to
`/orgs`; the invitation link still works when opened again.

## When verification is required

`requiresEmailVerification(env)`: always on production or any HTTPS `APP_URL`. Off in `APP_ENV=test`
(tests opt in per request with the `x-test-require-email-verification: 1` header) and in the local
plain-http offline demo (`FAKE_EXTERNALS=true`), where mail goes to an in-memory fake nobody can open.

Verification also closes a gap in invitations: acceptance checks the signed-in user's email against the
invited address, and with verification required that address is one the user proved they read.

## Throttles

- Durable per-IP and per-account limits in D1, in front of Better Auth
  (`src/worker/middleware/auth-rate-limit.ts`, counters `throttle:auth:*` in the `verification` table): per
  client IP on every auth POST (sign-in 20/15 min, sign-up 10/h, reset request 10/h, reset 20/h,
  verification resend 10/h, change password 10/15 min, others 60/15 min) and per account on failed
  password sign-ins from any IP (10/15 min, keyed by a SHA-256 of the address; successful sign-ins never
  count). 429 with `Retry-After`. On wherever the deploy is hardened (production/HTTPS); worker tests opt
  in with `x-test-auth-rate-limit: 1`. A D1 error fails open (logged).
- Better Auth's in-memory limiter (per isolate, HTTPS only): sign-in 10/min, sign-up 5/min,
  send-verification-email 3/min, request-password-reset 3/min, reset-password 10/min.
- Durable per-user windows (`throttle:<kind>:<userId>`): 3 confirmation and 3 reset emails per 15
  minutes, 1 "already have an account" email per hour. A throttled or failed send is logged
  (`auth.email_throttled`, `auth.email_failed`, user id only) and never changes the HTTP answer.

## Provider (`src/worker/ports/email.ts`, `createEmailSender`)

| Setting | Mail goes to |
| --- | --- |
| `APP_ENV=test`, or `FAKE_EXTERNALS=true` outside production | `FakeEmailSender` (memory) |
| `EMAIL` binding present and `EMAIL_FROM` set | Cloudflare Email Service (`CloudflareEmailSender`) |
| anything else | `LogEmailSender`: logs `email.not_sent_no_provider` with the recipient count and subject |

The `EMAIL` binding is `send_email` in `wrangler.jsonc`; `wrangler dev` only simulates sends. The adapter
keeps the apps/grants rules: one bare address per recipient, the subject flattened to one line,
`EMAIL_FROM` refused unless it is one safe address, the provider's error code kept in the thrown message,
and logs that never carry an address, link or token. Pricing, limits, SPF/DKIM and the beta caveat:
`apps/grants/docs/EMAIL.md`.

## Turning it on (the deploy, once it exists)

Seller Books has no deploy workflow yet (`docs/ARCHITECTURE.md`, "Gaps / next"). When it gets one:

1. The sender domain must be onboarded to Cloudflare Email Service. `marisstella.app` already is, for
   apps/grants (`apps/grants/email-sending.json`).
2. Set `EMAIL_FROM`, for example `Seller Books <no-reply@marisstella.app>`, as a deploy var.
3. After the deploy, `GET /api/health` must answer `"email": true`. With `false`, verification is still
   required on HTTPS, so nobody can finish signing up: treat it as a failed deploy.

The Privacy Policy names Cloudflare as the sender of account emails (policy version `2026-11-26.2`).
