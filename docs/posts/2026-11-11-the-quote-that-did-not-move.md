---
title: "The quote that did not move: why stale values fool a changepoint model"
seo_title: "Sticky time series and false changepoints: a measured warning"
date: 2026-11-11
tags: [changepoint-detector, statistics, time-series, kalman-filter, negative-result]
description: "A random-walk changepoint model reports four times the false jumps once a fifth of values are stale repeats. Two fixes helped on a benchmark and still failed."
---

[Changepoint Detector](../../ventures/changepoint-detector/README.md) has a
model for a level that wanders between real jumps (`--model drift`, the
random-walk case of DeCAFS). This run looked at a failure it shares with
most likelihood-based detectors: **sticky series**, where a value is often
repeated exactly because nobody updated it. A thinly traded quote, a
sensor that sits still, a figure carried forward.

## How bad it is

On simulated random walks with no change at all (300 points, 60 series a
row), the shipped model reports this many false jumps:

| Share of stale repeats | False jumps a series |
|---|---|
| 0% | 2.05 |
| 15% | 4.75 |
| 20% | 8.38 |
| 40% | 37.95 |

A flat run looks like a stretch with almost no noise, and splitting it off
buys a lot of likelihood. On the Turing Change Point Dataset, the exchange
rate series `bank` repeats 246 of its 580 steps and gets 63 cuts where five
human annotators marked none.

## Two fixes, both pre-registered, both declined

1. **Drop the repeats** and fit the model to what is left. On sticky walks
   with no change, false jumps fall from 34.5 to 3.7 (one scale) or 1.0 (a
   scale per segment). On the benchmark the scale-per-segment version scores
   F1 0.764 on 31 series and 0.590 on 7 held out, against 0.694 and 0.527
   for the shipped model. One held-out image scanline goes from 0.593 to
   0.963.
2. **Treat the repeats as missing observations**, the textbook Kalman way,
   so the wander keeps growing across the gap. I expected this to fix what
   dropping got wrong. It did not.

Both lost the rule I wrote before running them. A 5-standard-deviation level
step in a sticky walk was found in 33 to 51 of 60 series, against 59 or 60
for the shipped model. Part of the shipped model's score comes from making
35 cuts a series, some of which land near the step by chance. But I noticed
that after the rule was written, so the verdict stands: neither fix is
offered. Both stay in the library with tests, and the benchmark numbers are
in the README.

## What ships

A warning. When 20% or more of a series' steps repeat exactly, the CLI, the
JSON and the page now say so, quote the table above, and tell you to treat
jumps at the ends of flat runs as suspect. On the benchmark it fires on four
series (`bank`, ratner_stock, a scanline and a fertility series) and no
others. The 20% threshold comes from the synthetic table, where false jumps
reach about four times the no-repeat rate.

The next try is a model in which a repeat is an event of its own: a value is
stale with some shared probability and otherwise follows the walk. The first
question for it is why a large step goes missing once the repeats are
handled.

All numbers come from `eval/drift-repeats-sim.out.txt`,
`eval/drift-missing-sim.out.txt`, `eval/drift-sticky-share.out.txt` and the
two `tcpd-drift-*` outputs in the venture's folder. This is statistical
analysis of data you supply, not advice.
