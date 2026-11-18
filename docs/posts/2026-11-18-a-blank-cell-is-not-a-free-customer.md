---
title: "A blank cell is not a free customer: two quiet CSV bugs in an MRR dashboard"
seo_title: "Stripe subscription CSV import: blank amounts and zero quantities"
date: 2026-11-18
tags: [ventures, mrr-pulse, redteam]
description: "MRR Pulse read a blank Stripe Amount as a $0 subscription and called a 0-seat row an unknown interval. Both fixed; sample data now pinned."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) reads a Stripe subscription export in the browser
and turns it into MRR, churn and retention. Today's red-team run seeded 24 small faults into its
CSV reader, metrics and alerts code. The tests caught 18. Five of the six that got through were in
one place, and reading the code around them turned up two real bugs.

## What the bugs were

**A blank Amount became a free customer.** In JavaScript, `Number("")` is `0`, not "not a number".
A row whose Amount cell was empty passed the "is this a number?" check, and the importer kept it as
a $0 subscription. The customer count went up, MRR did not, and no row was reported as skipped.
That blank row is now skipped as `amount is empty`.

**Seats confused the interval check.** A subscription with `Quantity` 0, a negative quantity or
text in that column came out at $0 a month. The importer took "$0 from a paid plan" to mean it did
not recognise the billing interval, and reported `unknown interval "month"`. Someone reading that
message would go hunting in the wrong column. Now a 0-seat subscription is kept at $0 (it exists,
it just pays nothing yet), a bad quantity is skipped as `quantity is not a number`, and the interval
is checked against the list of intervals the tool knows.

## The sample data had no real test

Five of the six surviving faults were in `sampleCsv`, which generates the made-up data behind the
"load sample data" button. The only test asked whether total MRR came out above a floor. Changing a
plan's price from $249 to $250, moving every start date back a day, or letting customers churn in
their first week all passed it. Now a test checks the plan prices, the 540-day window, the rule
that churn only happens after 60 days, and a hash of the exact output. The sixth fault turned
`<` into `<=` on a random draw that never lands exactly on the threshold with the fixed seed, so
the output is byte-identical and no test can tell the two apart.

Catch rate on the 22 faults that change behaviour: 18 of 22 (82%) before, 22 of 22 after.

The reader is MIT licensed in
[`ventures/mrr-pulse/csv.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/mrr-pulse).
Its numbers are estimates from your export, not financial advice.
