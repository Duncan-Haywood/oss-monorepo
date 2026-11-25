---
kind: note
date: 2026-11-25
tagged: auto
---
# CMMC Workspace: account email (private PRs 174 and 175)

Bet #4 (`portfolio/monetization/bets.md`). Covers the `private-monorepo/apps/cmmc` ROADMAP item "Account email",
claimed as `claim/cmmc/account-email`. It was the launch blocker `apps/cmmc/docs/DEPLOY.md` named for open sign-up.

## What landed
- PR 174 ports jobshop-quote's email stack: `ports/email.ts` (the Cloudflare Email Service `send_email` binding
  `EMAIL` plus `EMAIL_FROM`; a fake in tests and the demo; a log-only sender otherwise), `services/auth/emails.ts`
  (templates and per-user D1 throttles) and the Better Auth verification and reset flows linking to SPA pages
  `/verify-email`, `/reset-password` and `/forgot-password`. Sign-in requires a confirmed address on any HTTPS or
  production deploy. `/api/health` now reports `email`, and `cmmc-deploy` passes `vars.CMMC_EMAIL_FROM` (default
  `CMMC Workspace <no-reply@marisstella.app>`) and warns when `email:false`. Rules are in `apps/cmmc/docs/EMAIL.md`.
- Beyond the port: `addMember` refuses an unconfirmed account wherever sign-in requires confirmation. cmmc adds
  members by an existing account's address and has no invitation tokens, so without this an account squatting
  someone's address could be put into an organization. The client's `lib/api.ts` now reads Better Auth's top-level
  `code`. Before this it only read `{error: {code}}`, so `EMAIL_NOT_VERIFIED` and `INVALID_TOKEN` were lost.
- PR 175: the Privacy Policy said "does not send email today". It now lists the three account mails, and
  `POLICY_VERSION` is `2026-11-25.2`.

## Verified
These ran locally: typecheck, biome, unit tests 224/224, worker tests 61/61 (the new `test/worker/auth-email.test.ts`
covers verify, resend throttle, reset TTL, single use and revocation, the existing-account notice, the unconfirmed-member
refusal and link origins) and `pnpm build`. Private CI jobs fail in about 3 s with no logs (runner not starting, same as
PR 173). The new pages were not checked by eye in a browser.

## For the next run
- Owner step: onboard the sender domain to Cloudflare Email Service, after which the smoke test should show `"email":true`.
- Not ported: jobshop-quote's durable per-IP auth rate limits (`middleware/auth-rate-limit.ts`, which uses D1). cmmc has
  only Better Auth's per-isolate memory limits plus the per-user send throttles. Port it before open sign-up.
- Next on the same port: the affirmation reminder email (ROADMAP Next, "part 2"). It needs an opt-out, and
  `ports/email.ts` already allows `List-Unsubscribe`. Emailed invitations and MFA remain launch blockers in `docs/SECURITY.md`.
