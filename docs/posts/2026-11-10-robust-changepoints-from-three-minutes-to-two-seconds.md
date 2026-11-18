---
title: "One sort per segment: robust changepoints went from three minutes to two seconds"
seo_title: "Faster PELT with a Laplace median cost: keep each segment sorted"
date: 2026-11-10
tags: [performance, changepoint-detection, javascript, open-source]
description: "Keeping each segment sorted cut a robust changepoint run from 183 s to 1.9 s with bit-identical costs, and let a 33-year Dow Jones run finish."
---

[changepoint-detector](../../ventures/changepoint-detector/README.md) is a
free, MIT-licensed tool that finds where a time series changes. Its `--robust`
option assumes Laplace (double-exponential) noise instead of Gaussian, so one
wild day on a stock index pulls the fit less. The cost of a segment is then
built from its median and its mean absolute deviation about that median.

A median has no running-sum shortcut, so the code sorted the segment. PELT,
the search underneath, scores every candidate segment it hasn't pruned. On
1,859 daily CAC 40 returns with few changes, that is about 1.7 million
segments, and each was copied and sorted again. That one run took **183
seconds** and was the slowest test in the project's suite.

PELT asks for each start point with the end moving forward by one. So each
start now keeps its segment in a sorted array and slots each new value in
with a binary search. The sorted values and the order of the sum are what
they were, so every cost comes out bit for bit the same. We checked 755,282
calls against the old code and found no difference. The CAC run now takes
**1.9 seconds**, and the test suite uses a third less CPU.

The fix also had a product payoff. Our write-up of 33 years of Dow Jones
returns (8,609 days) had said the robust run "did not finish in 9 minutes",
so the table had no row for it. It now finishes in 9 seconds: 12 changes,
one of them 15 September 2008, the day Lehman Brothers failed.

The measurements, the profile and the list of what's slow next are in
[`docs/history/ci-perf-2026-11-10-laplace-cost-sorted-runs.md`](../history/ci-perf-2026-11-10-laplace-cost-sorted-runs.md).
These are estimates from a statistical model, not investment advice.
