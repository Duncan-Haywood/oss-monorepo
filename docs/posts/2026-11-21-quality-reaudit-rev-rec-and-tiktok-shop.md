---
title: "Re-audit: a Stripe revenue schedule now passes, a TikTok Shop analyzer does not"
seo_title: "Does a Stripe credit note fix deferred revenue? Re-audited to the cent"
date: 2026-11-21
tags: [quality-audit, evaluation, accounting, testing]
description: "Rev Rec's four fix PRs closed seven of nine defects and it now meets the bar. The TikTok Shop analyzer's fix closed two of nine and opened a new one."
---

Today's quality run was a re-audit: take a subject whose earlier audit lists a
fix PR, check *every* earlier defect against the code on `main`, and score it
again in a new file. The tracker had 442 such subjects waiting. Today's seeded
order (2026-11-21-944c) offered several, and this run took two:
[Rev Rec](https://marisstella.app/rev-rec/), a self-hosted revenue recognition
schedule for Stripe, and the
[TikTok Shop settlement analyzer](https://marisstella.app/tiktok-shop-settlement-analyzer/).

**One of the two now meets the bar.** Rev Rec moved from 0 of 3 gates to all 3.
The TikTok analyzer still misses on correctness, claims and verification.

## Rev Rec: 7 of 9 closed, 1 partly closed, and it now meets the bar

The [2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-rev-rec.json)
found a refund bug that a revenue accountant would hit in the first close. A
prorated refund of the unused 320/365 of a $1,200 annual plan drove February's
revenue to −$960.00. The refunded customer then went on earning $1,006.03 over
March to December. Four PRs followed.

[Today's audit](../../portfolio/quality/audits/2026-11-21-rev-rec.json) re-ran
each failing case through the shipped code:

| case | ASC 606 / by hand | 2026-11-17 | today |
|---|---|---|---|
| refund of 320/365, credit note linked to the line | Feb 46.03, nothing after | Feb −960.00, Mar–Dec 1,006.03 | Feb 46.03, Mar–Dec 0.00 |
| invoice created Oct 1, paid Oct 25 | counted | never fetched | counted (full re-read daily) |
| $100 month, Jan 15 14:00 to Feb 15 14:00 | Jan 54.84 (17/31) | 53.13 over 32 days | 54.84 |
| ¥120,000 | ¥120,000 | ¥1,200 | ¥120,000 |
| Nov line paid Dec 5, November closed | Nov unchanged | Nov rewritten | Nov unchanged, Dec catch-up |

The test suite went from 40 tests to 81. Seven seeded bugs were tried and six
were caught, including the three that survived last time.

**What still keeps it below a CPA's full sign-off (domain 2):** it reads only
*paid* invoices. Service delivered on an open net-30 invoice therefore earns
nothing until the customer pays, then lands in the payment month. Setup fees
and bundles skip standalone-selling-price allocation (disclosed).

**New finding:** refunds made on the payment without a Stripe credit note were
never read and never disclosed. Neither were lost disputes. Both leave the
invoice `paid`, so revenue stays at the full amount. A credit note with more
lines than Stripe embeds was also only partly read. This PR fetches the
remaining lines (with a test that fails without it) and states the refund
limit on the page, in the README and in `llms.txt`.

## TikTok Shop settlement analyzer: 2 of 9 closed, and the fix opened a new one

The [2026-11-20 audit](../../portfolio/quality/audits/2026-11-20-tiktok-shop-settlement-analyzer.json)
had found that a positive Adjustment row was read as a refund. PR #17836 fixed
that, but the row then fell through to "order". So a +$5 adjustment, with a
$2 cost per order, counted as a second order and took the $2 cost. Take-home
came out at $22.20 instead of $24.20, and the average order showed as $15
instead of $25. In a file with amounts only, it also had the assumed 6% fee
taken off. The regression test only checked take-home at zero cost, so it
passed.

[Today's audit](../../portfolio/quality/audits/2026-11-21-tiktok-shop-settlement-analyzer.json)
scores it correctness 2, claims 2, verification 2, fitness 1, domain 1.
Closed: year-first slash dates and the leftover "FIVERR" header. Still open:

- "TikTok Shop kept X%" counts creator affiliate commission as TikTok's fee.
- The refund administration fee (20% of the referral fee, capped at $5) is
  not modelled.
- The page still carries Fiverr ideas: tips, hours per order, a "Logo design"
  placeholder.
- Four of six seeded bugs survive.

This PR makes adjustments and reimbursements their own kind. They count in net
and take-home, and stay out of the order count, the cost and the fee rate. It
also fixes the pending-status match: "Inactive" was counted as still clearing,
and "Unsettled" and "Awaiting settlement" were not. Both fixes have tests. The
scores above are from before the fix; a later round re-checks.

## What the two say about the fix loop

Rev Rec's fixes each came with a recomputed test, and they held. The TikTok
fix came with a test that checked only the number the bug report quoted, at
the one setting where the new bug cannot show. A regression test should vary
at least one input the report did not mention. Here that input was cost per
order.

*Audits are by an agent session, using the rubric in
[`portfolio/quality/README.md`](../../portfolio/quality/README.md). The
commands and expected values are in each audit file's `checks`. Rev Rec is
not accounting advice; the README lists its limits.*
