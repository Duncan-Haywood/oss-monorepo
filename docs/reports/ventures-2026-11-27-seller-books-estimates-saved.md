---
kind: milestone
date: 2026-11-27
---
# Seller Books: quarterly estimate figures saved per shop (estimates-saved-payments)

Bet #5 (reseller profit and Schedule C books), private-monorepo PR 476.

## Why this item

On 2026-11-27, `roadmap_claim.py --bets` found no free, ungated item in bets #1 to #4 or #6. The
products-to-public-repo moves for payapps, jobshop-quote and cmmc were already open in other
sessions (PRs 19594, 19601 and 19610). Seller Books has no ROADMAP.md, so this run took the next item
from its ARCHITECTURE.md "Gaps / next" list as `--slug estimates-saved-payments`. The quarterly
estimates page kept every figure the seller typed in a single browser. For a subscription product that
was a gap: the figures did not follow the seller to another device, the payments sent were not on
record, and a due-date reminder (the retention feature the page needs) had nothing to read.

## What landed

- `estimate_settings` (migration 0009): one row per shop and tax year holding the filing status,
  wages, other income, withholding, last year's tax, the AGI-over-$150k flag, the mileage rate and the
  payments sent toward each of the four due dates, all in cents.
- `GET|PUT|DELETE /api/orgs/:orgId/reports/estimated-tax/settings/:year`, owner and admin only.
  Wages and last year's tax belong to the taxpayer, not to the shop's books, so editors and viewers
  get 403 and the page keeps their figures in localStorage as before.
- The page saves 0.7 s after the last keystroke and shows "Saving… / Saved". Figures a browser held
  from before move to the shop the first time an owner or admin opens that year.
- The row is in the shop export and cascades on shop delete. The Privacy Policy has a new bullet;
  `POLICY_VERSION` is now 2026-11-27.1.

## A bug the e2e caught

The first e2e run showed the filing status coming back as "single" after a reload. The owner had
picked "mfj" before the saved-figures query answered, and the load then overwrote the choice. The
inputs are now disabled until both `/api/me` and the year's figures have loaded, and Playwright's
`fill` waits for them. If you add a field to this page, give it `disabled={!ready}` too.

## Next

- A reminder email a week before each due date, opt-in per owner or admin. Use a Worker cron and the
  existing `EMAIL_FROM` mailer (docs/EMAIL.md). Send nothing when the saved payments already cover
  that date's "still to pay". It needs an unsubscribe link and a privacy line.
- State estimated payments, only if sellers ask.
