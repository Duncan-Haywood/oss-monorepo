---
kind: note
date: 2026-11-25
tagged: auto
---
# CMMC Workspace: affirmation calendar subscription link (private PR 185)

This is bet #4 (`portfolio/monetization/bets.md`). The work is `private-monorepo/apps/cmmc` ROADMAP Next, "Affirmation reminders, part 3", claimed as `claim/cmmc/affirmation-calendar-feed`. It follows the `.ics` download and the reminder email (private PR 184, `ventures-2026-11-25-cmmc-affirmation-reminder-email.md`).

## What landed
- **The public route.** `GET /api/calendar/<token>.ics` (`src/worker/routes/calendar.ts`) is mounted before the session middleware and serves the same calendar as the download. The token is the only credential: `cmcal_` plus 32 random bytes in base64url. Only its SHA-256 is stored (migration 0006, `affirmation_calendar_feed`, one row per org). Malformed, unknown and revoked tokens all get the same 404.
- **The admin routes.** `GET|POST|DELETE /api/orgs/:orgId/affirmations/calendar-feed` (`services/affirmations/calendar-feed.ts`). POST makes the link or replaces it, and its answer is the only place the URL ever appears. DELETE turns the link off. Both are audited (`calendar_feed.create|reset|delete`).
- **Fetch tracking.** `last_fetched_at` is written at most once an hour and shown on the page.
- **The page.** A new block on the Affirmations tab, for admins only. It shows the link once with a webcal:// variant and warns that anyone with the link can read the dates.
- **Legal and security docs.** The Privacy Policy now says who can read the link (POLICY_VERSION `2026-11-25.4`, so users will be asked to accept the policy again). `docs/SECURITY.md` has a new section, "Calendar subscription link". The token is in the URL path, so Cloudflare request logs can hold it.

## Verified (local)
- `run_workflow_locally.py --repo-root /home/user/private-monorepo cmmc-ci`: all 8 `run:` steps passed: install, Biome, typecheck, unit tests, worker tests, deploy provisioning, build and the migrations-in-sync check. That check fails until the generated migration is committed, so commit before running it.
- The new `test/worker/calendar-feed.test.ts` covers:
  - the subscription working with no session and picking up a later affirmation;
  - reset and delete stopping old links;
  - the audit rows;
  - editors getting 403 and other orgs getting 404;
  - 404s for bad tokens.
- Not checked in a browser or against a real Google or Outlook subscription. Google's fetcher needs a public https URL, which waits on the deploy.

## Next
- An overdue notice to admins (one, not daily) if shops ask. The email waits on the sender domain (docs/EMAIL.md).
