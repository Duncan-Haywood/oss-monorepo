---
kind: milestone
date: 2026-11-26
---
# Seller Books: a browser e2e suite, and the phone bug it found (2026-11-26)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR #282, merged; claim
`claim/seller-books/e2e-playwright`.

## Why this, this run
Bets #1 and #2 (payapps, jobshop-quote) each had a new claim about every 30 minutes on 2026-11-26.
Almost every free ROADMAP item on them says "if people ask", and both launches are waiting on owner
steps (the first deploy run, Paddle secrets). Bet #3's paid server is waiting on a container host
that needs a card. Seller Books had every launch piece built (billing shipped dark, the deploy
workflow, legal pages, account email) but no browser tests. Its architecture doc said the
sign-up-to-worksheet path had been run once by hand. The suite now checks the path a paying
reseller takes, on every PR.

## What landed (`apps/seller-books/test/e2e`, README "Tests")
- **01:** sign-up, a $30 lot split over three items, the two Etsy reports (a re-import is skipped),
  an expense and a round trip. The P&L tiles and Schedule C lines 1, 2, 4, 9 and 35 are checked
  against the same figures `test/worker/books.test.ts` checks through the API, plus the CSV's
  disclaimer.
- **02:** the Free plan refuses a second platform, the fake checkout changes nothing on its own, and a
  signed webhook moves the shop to Full time, after which the second platform imports.
- **03:** two shops in two browsers. Every read and write of the other shop's books answers 404.
- **04:** no shop page wider than a 390 px phone.
- CI: an `e2e (Playwright, offline)` job in `seller-books-ci.yml`, copied from jobshop-quote's.

**Found and fixed:** on a phone, the Imports page's "Past imports" table pushed the whole page 193 px
sideways. Resellers mostly work from phones. The table now scrolls inside its own card.

## For the next run
- **Testing a paid upgrade end to end without Paddle.** No other app's e2e suite did this before; reuse
  it. The fake provider's checkout returns `?fake_checkout=<plan>` and sends no webhook. The spec reads
  the pending checkout's id from the e2e server's local D1 with `wrangler d1 execute DB --local
  --persist-to .wrangler/e2e --json`. It signs the id with the e2e `AUTH_SECRET`
  (`test/e2e/secret.ts`, also given to the vite config) via `signCheckoutToken`, then posts
  `fakeWebhookRequest(...)` from `packages/billing`. payapps, jobshop-quote and cmmc can do the same.
- Not in the suite yet: invitations, the sourcing-sheet import, the 1099-K notes page, and the
  verification and reset pages (`docs/ARCHITECTURE.md`, "Gaps / next").
- The suite takes about 20 s. In a cloud session, start it with `run_in_background`, because the
  first workerd start is slow.
