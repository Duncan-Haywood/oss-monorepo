---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: page dates on the shop's time zone (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #222 (branch
`claude/jobshop-page-dates-shop-time-zone`, claim `claim/jobshop-quote/page-dates-shop-time-zone`,
ROADMAP item 10). It closes the part that PR #220 left open: "the dates the app's own pages print
still slice the UTC instant".

## Why this item
The private clone worked first time (add_repo with push, one shallow clone). Bet #1 (payapps) has
around thirty claims from the last ten hours. Its free Next items are "once a customer asks", need
OCR or a WebAssembly decoder, or need statute text the proxy blocks. On jobshop-quote, every other
free item is also marked "if shops ask". This one was a visible inconsistency a US shop would see
every evening. A quote sent at 7 pm in Chicago showed tomorrow's date in the quote log and in
"Sent", while its PDF (fixed by PR #220) showed today's.

## What landed
- `src/shared/time-zone.ts`: `isoShopDay(iso, zone)` is the shop's day for an ISO instant. It
  returns "" when the instant is missing or bad, so a page never prints "Invalid Date".
- `src/client/routes/layout.tsx`: the `useShopDay(orgId)` hook. It reads `settings.timeZone` from the
  `["org", orgId]` query, which every signed-in page already loads and which a rate-card save
  invalidates, so it adds no request. Until that query loads, dates fall back to UTC.
- Seven call sites now use the hook:
  - the quote log's date column;
  - the RFQ list;
  - "Sent" on the quote's Outcome card;
  - part history on the quote page and on the RFQ page;
  - won-price dates on Win/loss;
  - invite expiry on Team.
- The hook must run before any early `return null`. That is why it sits at the top of
  `RfqPartHistory` and `PartHistory`.

## Not changed
- `toLocaleString()` timestamps (RFQ refused-sender times, routing "Last changed") still show the
  viewer's browser time with a clock. A person reads those as "when, for me", so the browser's zone
  is right for them.
- Billing dates (`graceUntil`, `currentPeriodEnd`) are Paddle's period dates. They stay as they
  are, as in `docs/BILLING.md`.

## Mistake to avoid
`src/shared/time-zone.test.ts` already existed. A heredoc `cat >` replaced it. `git diff --stat`
caught the change before the commit, and the file was restored and the new tests appended. Check
whether a test file exists before you write one.

## Verification
- `vitest run src/shared/time-zone.test.ts`: 9 tests pass, 4 of them new. They cover Chicago
  evening, Tokyo ahead of UTC, an unknown zone falling back to UTC, and null or bad input.
- `pnpm typecheck` is clean. `pnpm build` succeeds. Biome is clean on the touched files.
- Private CI ended red in 3 s with no runner (`ci_starvation.py`: 2 of 2 jobs starved). So
  `run_workflow_locally.py --repo-root /home/user/private-monorepo jobshop-quote-ci` ran from the
  clone; its result is in this run's record.
