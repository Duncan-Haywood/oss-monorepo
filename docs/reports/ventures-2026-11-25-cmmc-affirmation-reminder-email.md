---
kind: note
date: 2026-11-25
tagged: auto
---
# CMMC Workspace: affirmation reminder email (private PR 184)

Bet #4 (`portfolio/monetization/bets.md`). This is `private-monorepo/apps/cmmc` ROADMAP Next, "Affirmation reminders by
email, part 2", claimed as `claim/cmmc/affirmation-reminder-email`. It could start once account email landed (PRs 174
and 175, `ventures-2026-11-25-cmmc-account-email.md`).

## What landed
- `services/affirmations/reminders.ts`, run by a daily cron (`23 11 * * *`, the Worker's first `scheduled` handler).
  It emails admins and owners when an annual affirmation, self-assessment or POA&M closeout date is 60 or 7 days out.
  The stages are in `src/shared/affirmation-reminders.ts`, and the dates come from the same `affirmationSchedule` the
  page uses. Overdue dates get no email.
- Exactly once: before any mail goes out, each (org, level, deadline, due, stage) is inserted into
  `affirmation_reminder_sent` (migration 0005) with `ON CONFLICT DO NOTHING ... RETURNING`, and only the rows that came
  back are mailed. A missed day sends on the next run.
- Opt-out: `member_notifications` (on by default), switched from the Affirmations tab (`GET|PUT
  /affirmations/reminders`). Each message also carries an RFC 8058 one-click stop link (`/api/unsubscribe/affirmation-reminders`).
  It uses payapps' HMAC token, in `src/worker/lib/unsubscribe-token.ts` under its own label, and a public `/unsubscribe`
  page in the SPA.
- The Privacy Policy now describes the reminder, and `POLICY_VERSION` is `2026-11-25.3`.

## Verified (local)
- typecheck clean; biome clean on touched files; `pnpm build` ok.
- Unit tests: 230/230. Worker tests: 66/66. The new `test/worker/affirmation-reminders.test.ts` covers both stages,
  no repeats, a missed day, overdue, roles, opt-out, the stop link (a tampered link gets a 404, GET changes nothing)
  and cross-tenant settings (404).
- Private CI: one job failed in about 2 s with no logs (HTTP 404), the same runner problem PR 173 and PR 174 recorded.
- The toggle and the `/unsubscribe` page were not checked in a browser.

## For the next run
- Mail goes out only after the owner onboards the sender domain (`apps/cmmc/docs/EMAIL.md`, "Turning it on").
- ROADMAP's next affirmation item is part 3: a subscribable calendar URL (a revocable per-org token), and perhaps a
  single overdue notice.
- The cron runs through organizations one after another, which is fine at pre-launch scale. Once many orgs have
  affirmations, batch them or move the work onto a Queue.
