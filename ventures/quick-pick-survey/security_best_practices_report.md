# Security hardening review

## Executive summary

The application already had strong fundamentals: password hashing, opaque
database-backed sessions, constant-work login checks, centralized same-origin
enforcement, ownership checks for respondent reads, and database-backed rate
limits. This pass closed the highest-impact remaining application-level gaps.

## Fixed findings

### SEC-001 — High — password-reset token race

- Location: `src/app/api/auth/reset-password/route.ts`, `POST`
- Evidence: token validity was read before a transaction and later marked used
  with an unconditional update.
- Impact: two concurrent requests could both accept one single-use token and set
  different passwords.
- Fix: atomically claim the unused, unexpired token with a conditional
  `updateMany`; only the successful claimant changes the password. All existing
  sessions and other reset tokens are revoked.

### SEC-002 — Medium — unbounded account creation

- Location: `src/app/api/auth/signup/route.ts`, `POST`
- Evidence: the route created users and sessions without consulting the shared
  database-backed anonymous-write limiter.
- Impact: automated callers could create unbounded account and session rows.
- Fix: limit successful account creation to eight per IP per 15-minute window.

### SEC-003 — Medium — missing browser hardening baseline

- Location: `next.config.ts`
- Evidence: only `output: "standalone"` was configured.
- Impact: the browser had no application-defined clickjacking, MIME-sniffing,
  referrer, permissions, or content-loading restrictions.
- Fix: add CSP, frame denial, nosniff, no-referrer, permissions policy, and
  cross-origin isolation headers; remove the framework-identification header.

### SEC-004 — Low — session cookies lacked host-prefix protection

- Location: `src/lib/auth.ts`, `src/lib/adminAuth.ts`, admin login route
- Evidence: production cookies used ordinary names without cookie priority.
- Impact: a sibling subdomain could potentially shadow a broadly scoped cookie
  if deployment configuration later changed.
- Fix: production cookies use the `__Host-` prefix with `Secure`, path `/`, no
  Domain attribute, and high priority. The user cookie accepts its legacy name
  during migration to avoid an unnecessary mass sign-out.

## Remaining operational checks

- Verify the deployed response headers after redeployment; edge configuration is
  outside this repository.
- Keep `ADMIN_SESSION_SECRET`, `ADMIN_KEY`, database credentials, and Resend keys
  in Vercel secrets and rotate any value ever exposed outside the secret store.
- The CSP temporarily permits inline scripts/styles for compatibility with the
  statically rendered Next.js build. Moving to nonce-based CSP would force all
  pages to dynamic rendering; evaluate that performance tradeoff separately.
- Run dependency and secret scanning in CI once GitHub Actions runner allocation
  is functioning.

## Second-pass fixes

### SEC-005 — High — account-owned rankings writable by participant ID

- Location: `src/app/api/trials/*`, `src/app/api/financial-trials/*`
- Evidence: write routes loaded a participant or trial by opaque id but did not
  compare the participant's `userId` with the signed-in account.
- Impact: anyone who obtained an account-owned participant or trial id could
  create questions, answer, skip, or undo comparisons in that account's ranking.
- Fix: enforce the same ownership boundary used by insight reads on every trial
  mutation. Anonymous sessions intentionally remain capability-based.

### SEC-006 — Medium — unbounded declared request bodies

- Location: `src/proxy.ts`, `src/lib/http.ts`
- Evidence: API requests reached JSON buffering without an application-level
  declared-size check.
- Impact: oversized requests could consume avoidable memory and parsing work.
- Fix: reject malformed or declared bodies over 64 KiB with HTTP 413 before the
  route handler. The hosting edge remains responsible for chunked-body limits.

### SEC-007 — Medium — sensitive API responses not explicitly non-cacheable

- Location: `src/proxy.ts`
- Evidence: API responses relied on framework/platform defaults.
- Impact: account details or survey insights could be retained by a shared or
  intermediary cache if those defaults changed.
- Fix: every API response receives `Cache-Control: private, no-store, max-age=0`.

## Third-pass fixes

### SEC-008 — Medium — raw IP addresses retained in limiter tables

- Location: `src/lib/http.ts`, rate-limit and authentication helpers
- Impact: a database export or leak exposed network identifiers that were not
  needed after correlation inside the rate-limit window.
- Fix: persist only an HMAC-based identifier keyed by `RATE_LIMIT_SECRET`.
  Anonymous-write events are pruned after 24 hours; login events after 30 days.
  A deployment migration deletes legacy raw-IP limiter rows because they cannot
  be converted without disclosing the HMAC secret to SQL.

### SEC-009 — Medium — unlimited long-lived user sessions

- Location: `src/lib/auth.ts`, `createSession`
- Impact: repeated logins accumulated replayable sessions for 60 days, expanding
  the effect of a stolen session and growing the session table indefinitely.
- Fix: reduce lifetime to 30 days, cap each account at ten active sessions,
  delete expired sessions during issuance and lookup, and retain reset-driven
  revocation of all sessions.

### SEC-010 — Low — long admin-session lifetime

- Location: `src/lib/adminAuth.ts`
- Fix: reduce the signed admin session from 12 hours to 4 hours.
