---
title: "A stale-price test that leaves real trade prints alone, and misses short stale stretches"
seo_title: "Detecting stale price feeds: a growth test on real trades"
date: 2026-11-19
tags: [changepoint-detection, data-quality, market-data, statistics]
description: "Our stale-feed test called 56 of 56 real trade-print windows stale. A rank test on catch-up growth calls 1 of 56, but finds only 22 of 85 carried windows."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md)'s stale-feed test was run
on real prices for the first time ([that post](2026-11-19-changepoint-stale-test-on-real-trade-prices.md)). It
caught a last-trade price that had been carried forward, but it called the raw trade prints stale too, where nothing
was carried, in 56 of 56 windows. Real prices sit at a quote and repeat often, and the test was really counting
repeats.

A carried figure differs from a quote in one way you can measure. When it finally updates, the move it makes adds up
everything it missed while it sat still. So the longer the run of repeats, the bigger the move that ends it. A quote
that holds and then ticks has no such growth.

## The test

For every move that ends a run of repeats, we take k, the number of repeats just before it, and the size of the move,
then compute the rank correlation between the two. You don't need to simulate the threshold. If move size doesn't
depend on k, that correlation has a known permutation variance, 1/(n-1), whatever the ties. We wrote the rule and
four bars [before the first run](../../ventures/changepoint-detector/eval/stale-growth.mjs).

| bar | result |
|---|---|
| false calls on simulated quote-holding walks (5% expected) | 5.0% and 5.7%: pass |
| simulated carried feed caught (bar 80%) | 96%: pass |
| real trade-print windows called stale (bar 10% or fewer) | **1 of 56: pass** |
| real carried windows caught (bar 80%) | **22 of 85: fail** |

So nothing changes in the product. The test now leaves real trade prints alone, but it misses most real stale
stretches of 300 samples.

## Why real data is harder

In the simulation, the hidden price keeps moving every second whether anyone trades or not. A real price moves when
people trade. The seconds with no trade are mostly seconds when nothing happened, so a carried run hides far less
movement than the clock suggests. The correlation is 0.31 in a simulated carried window and 0.09 in a real one.

The growth is real, just small (z = 7.95 over the whole day), so you need a longer stretch to see it. A rerun at
longer windows, done afterwards and deciding nothing, catches 7 of 7 carried windows of 4,000 one-second samples and
still calls 0 of 8 print windows stale. The next round will set its bar by stretch length and test on fresh data. Then
a user can be told how long a stale stretch has to be before the test sees it.

Data: the trade samples of the R package highfrequency (GPL, fetched by a script, not committed). Details and the
full tables are in the README section "A catch-up test for multi-tick feeds".
