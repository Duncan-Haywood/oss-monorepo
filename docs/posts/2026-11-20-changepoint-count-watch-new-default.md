---
title: "Our order-count alert was tuned for the wrong noise: a lower bar, tested on fresh shops, becomes the default"
seo_title: "A better default for daily order-count change alerts"
date: 2026-11-20
tags: [changepoint-detection, statistics, ecommerce, pre-registration]
description: "With a cost for bunched counts, a lower alert bar cut false alerts from 3.26 to 1.03 per 1,000 days and heard 1,056 of 1,200 changes against 701."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a watch: point it at a shop's daily
order counts and it sends one alert when the level moves for good. Yesterday's round left the count watch one bar
short of a better default. A windowed Bayesian pass with a negative-binomial cost, a cost that expects busy days to
come in bunches as real orders do, sent a fraction of the false alerts and heard far more changes than the default.
It still missed more 40% drops in very bunched orders: 103 of 200 against 126.

That 126 had a cost the bar did not price. The old default reads a bunch of busy days as a change, so on the matching
no-change shops it sent 10.8 false alerts per 1,000 daily checks. The new cost sent 0.16. Its posterior had become
honest, but the alert bar, 0.5, had been set for the old cost and never revisited.

## The round

The rule was written down and committed before any seed ran
([pre-registration](../../ventures/changepoint-detector/eval/poisson-window-threshold.prereg.md)). There were eleven
kinds of simulated shop: five with no change and six with a drop or a rise at day 108 of 120, at 200 shops each. The
four bars were carried over unchanged: no more than one extra false alert per 1,000 checks at the top of the 95%
interval, no single null shop type more than 2 worse, more changes heard overall, and no change type more than 4 of
200 worse.

Tuning (seeds 601-800) tried bars from 0.5 down to 0.2 and took the highest that cleared everything. At 0.5 and 0.4
the 40% drop stayed short (-23, -9). At 0.25 and below, small Poisson counts of 5 a day started paying 2.6 to 3.2
extra false alerts. 0.3 cleared all four.

The test used fresh seeds 801-1000 and ran once, at 0.3:

| | old default | new default |
|---|---|---|
| false alerts per 1,000 checks (five null types, averaged) | 3.26 | **1.03** |
| changes heard of 1,200 | 701 | **1,056** |
| 30% drop, 30 to 21 a day | 70 of 200 | 173 |
| 40% drop in very bunched orders | 129 of 200 | **145** |
| bunched null shop (variance 3x the mean) | 12.26 per 1,000 | 0.65 |
| plain Poisson null, 30 a day | 0.00 per 1,000 | 1.13 |

That is 2.23 fewer false alerts per 1,000 checks (95% interval 1.55 to 2.90) and 355 more changes heard (326 to
385). All four bars passed.

## What it costs

The last row is the price. On counts that really are Poisson, with no bunching for the cost to find, the lower bar
sends about one false alert in two to three years of daily checks where the old setting sent almost none. The one
public shop we measured is not Poisson, though: its daily orders vary 4 to 6 times their mean, past the bunchiest
simulated cell. If shops like it are typical, the trade favours them.

## What ships

`node watch.mjs orders.csv --model poisson` and every count column in `--columns` now run the new default, and the
output says so on the column. Naming a detector, a clumping cost or a threshold keeps the old behaviour, and
`--detector bocpd` is the old default exactly. Two limits stay open. The "How eager" ladder still treats the old
setting as Quiet for counts, and it has not been re-measured. And this is simulation: no deployer's real orders,
with the changes the merchant knows about, have been scored yet. Details and both tables are in the README, "A
count default for clumped orders".
