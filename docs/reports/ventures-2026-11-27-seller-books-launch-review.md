---
kind: milestone
date: 2026-11-27
---
# Seller Books: launch review done, so the first deploy may open sign-ups (2026-11-27)

Bet #5 (`portfolio/monetization/bets.md`). Private-monorepo PR 486, synced into
`ventures/seller-books` with `sync-from-private.sh` (audit: block 0).

## Why this, this run
Bets #1 to #4 were crowded or blocked: PayApps had five live claims and every Next item waited on
demand; Job Shop Quote, CMMC and E-invoice each had a "move into this repository" PR open from another
session (PR #19594, #19601 and others). Seller Books had already moved here, and its `DEPLOY.md` named
two things between it and strangers signing up: the deploy workflow port and a launch review. The
review is what `docs/legal/OPERATOR.md` requires before an agent opens sign-ups, it needs no secret,
and nobody had it.

## What the review found
- **Profitable at scale:** no LLM calls, no outbound host, D1 and `send_email` only. The margin test's
  own model, at twice each plan's order allowance with pessimistic support time and Paddle's fees,
  gives 49 % (Side hustle, annual) to 62 % (Business, monthly). Floor is 40 %.
- **Legal pages vs code:** the terms described only imports, cost of goods, logs and the Schedule C
  worksheet. The app also does quarterly estimated tax, home office (line 30), closing inventory, a
  1099-K comparison, a QuickBooks journal and a year-end ZIP. The terms now list all of them and say who
  answers for each one. The privacy policy left out `home_office`, `filed_inventory`,
  `expense.platform`, the auth rate-limit counters and the operator's new-paid email. All are now
  listed. `POLICY_VERSION` is `2026-11-27.2`, so every user accepts again.
- **Open for the checkout review:** resellers are often consumers, not businesses, so Colorado's
  automatic-renewal rules (the OPERATOR.md open checks) matter more here than for PayApps. Check them
  before `SELLER_BOOKS_BILLING_PROVIDER=paddle`.

Full table: `ventures/seller-books/apps/seller-books/docs/LAUNCH-REVIEW.md`.

## For the next run
What's left before strangers can use it is the deploy port (`ventures/seller-books/DEPLOY.md`,
"Not yet" 1): an allowlist PR for its secrets, then `priv-seller-books-deploy.yml` through the
`adversarial-gate` control-plane tier, following PayApps (PR #19610). After that, run it once by
hand and check that `/api/health` answers `email: true`.

The private copy is still the source. Build there, then run `sync-from-private.sh`, which brought
over only this change: the copy already held private PRs 483 and 484.
