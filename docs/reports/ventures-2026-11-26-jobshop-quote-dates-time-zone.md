---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: quote dates on the shop's time zone (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #220 (branch
`claude/jobshop-quote-dates-shop-time-zone`, claim `claim/jobshop-quote/quote-dates-shop-time-zone`,
ROADMAP item 10, the part left open by PR #210: "the same zone for the dates printed on quotes and
the expiry email's 'tomorrow'").

## Why this item
The private clone worked first time (add_repo with push, one shallow clone). Bet #1 (payapps) had
every Next item claimed, blocked on statute text, needing a new dependency, or marked "once a customer
asks". Most jobshop-quote items are "if shops ask" too. This one was a concrete bug a US shop would
hit every evening: a quote sent at 8 pm in Chicago was printed with the next day's date, and its 30
valid days counted from that day.

## What landed
- `src/shared/time-zone.ts`: `shopDay(at, tz)` gives the day an instant falls on in the shop's
  calendar, with UTC when the zone is unset or unknown. `addDays(day, n)` does calendar arithmetic
  on `YYYY-MM-DD` strings.
- `services/quotes/index.ts`: four places now use the shop's day: the PDF's Date (preview and sent),
  `validUntil` on create and on revise (`validUntilFrom`), and `expireQuotes`.
- `expireQuotes` and `remindExpiringQuotes` still sweep every shop in one query each. Candidates are
  bounded by UTC's calendar, because no zone is more than a day from it. Expiry takes candidates with
  `validUntil <= UTC today`, and reminders take UTC yesterday through the day after tomorrow. Each
  candidate is then checked against its shop's own day, joined on its own `org_id`, and
  expired or claimed by id in chunks of 90, because D1 binds at most 100 parameters. The guards
  `status = 'sent'` and `expiry_reminded_at IS NULL` stay in the UPDATE, so overlapping runs still
  never act on a quote twice.
- The Rate card's time-zone hint, `docs/ARCHITECTURE.md`, `docs/EMAIL.md` and `ROADMAP.md` now say so.

## Not changed
- The dates the app's own pages print (the quote log, "Sent" on a quote) still slice the UTC
  instant. This is now the next part of item 10.
- Billing and AI-ceiling months stay UTC on purpose (`docs/BILLING.md`).

## Verification
- typecheck is clean, and biome is clean on the touched files. Unit tests pass. Worker: 208 tests in
  32 files pass.
- `test/worker/quote-dates-time-zone.test.ts` covers three cases: Chicago evening dating plus a
  revision, Kiritimati (UTC+14), Pago Pago (UTC-11) and UTC expiry, and the Kiritimati reminder.
  All three failed with the old `src/worker` stashed.
- Private CI ended red in 2-3 s with no runner (starved), so `run_workflow_locally.py
  jobshop-quote-ci` ran from the clone: 11/11 run steps passed, including Playwright e2e (8 `uses:`
  steps not run). PR 220 merged.
