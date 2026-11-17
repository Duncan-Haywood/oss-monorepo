---
title: "Tuning a drone for a slower motor than any we measured made it crash less at every lag"
seo_title: "Tune a drone for a slower motor than measured: fewer crashes"
date: 2026-11-17
tags: [research, robotics, drones, quadrotor, control, sim-to-real]
description: "Simulated 5-inch quadrotors tuned at a 45 ms motor lag crashed less than 39.1 ms tunes in 19 of 20 cells, even when flown at the fast 33 ms end."
---

Two posts today traced one question in our [rotor-cant co-design programme](../../research/codesign-cant/README.md): how should you tune a quadrotor in simulation when you know its motor lag only as a range? Two published system identifications put 5-inch quadrotor motors at 33 ms and 39.1 ms. Tuning at the [slow end](2026-11-17-tune-drone-at-slow-end-of-motor-lag.md) beat the midpoint, and [randomising across the range](2026-11-17-randomising-drone-motor-lag-made-tuning-worse.md) was worse than the slow end. Both pointed the same way: never train on a motor faster than the slowest measurement.

The obvious next question: how far past the slow end does that keep paying? Somewhere, tuning for an ever slower motor has to cost you when the real one is fast.

## The experiment

We retuned the same two objectives at 45 ms, 15% slower than the slower identification. No motor we know of was measured at 45 ms; it is a tuning choice, picked to bracket the answer from above. As before, the training plants multiply the lag by a random factor of 1 to 2 (so 45-90 ms), and the stability certificate is checked at those two corners. Everything else matched: CMA-ES over 6 seeds × 2 starts × 2 frame geometries, 3,200 evaluations per run, about 1.7 hours on four cores. The seven predictions went into the [log](../../research/codesign-cant/LOG.md) before the full run. The main one was that 45 ms would finally start to cost at 33 ms.

## What happened

It didn't. The test is the hard condition from earlier milestones: twice the trained centre-of-pressure lever, a 45° tilt limit, 384 held-out flights per set. Totals over both objectives and both geometries:

| Lag the designs fly | Tuned at 36 ms | Tuned at 39.1 ms | Tuned at 45 ms |
|---|---|---|---|
| 33 ms | 341 | 270 | 213 |
| 36 ms | 455 | 361 | 263 |
| 39.1 ms | 603 | 462 | 329 |
| 45 ms (stress) | 857 | 730 | 538 |

The 45 ms designs crashed less than the 39.1 ms designs in 19 of 20 objective-geometry-lag cells, with one tie. That includes all four cells at 33 ms, a motor 27% faster than anything they trained on. Over the measured range they crashed 21-29% less than the slow-end tune. Mass, propeller size and position gain barely moved, and tracking on the easy condition was no worse.

The cost turned up at the certificate, which is where the reading we wrote down in advance said to look. 22 of the 24 designs stay certified across 33-39.1 ms, against 24 of 24 for the slow-end tune. The two that fail are not clearly unstable. They sit right on the boundary (margin ratio 1.0000 to 1.0002 against a strict "below 1"), because the search pushes them onto the boundary at the 45/90 ms corners and they stay there at faster lags.

Four of seven predictions held. The three that failed all expected 45 ms to cost something: crashes at the fast end, or the certificate at the fast end.

## How sure we are

Same caveat as the last two posts. All four objective-geometry pairs agree at every lag (sign test p = 0.125, the smallest four cells can give), but per cell the Mann-Whitney p values run from 0.05 to 0.47 at six seeds. Read it as "probably better everywhere", not a measured gap. One simulator, a first-order motor lag, two identifications from one lab, one held-out set. And because training randomises the lag by a factor of 1 to 2, a 45 ms floor also raises the ceiling from 78 to 90 ms; this run does not separate the two.

## What it means

In this setup the lag error is one-sided across the whole span we tested: a controller tuned for a slower motor than the one it flies has not yet paid for it in crashes. The limit is the stability certificate at the fast end, not performance. So the practical rule tightens: tune for a motor slower than your slowest measurement, and let a margin check at the fastest measured lag decide how slow. Next we try 52 and 60 ms floors with that fast-end check as a hard constraint, and a run that raises only the ceiling, to find the knee and what causes it.

Code, results and the full log are in [`research/codesign-cant`](../../research/codesign-cant/README.md) (simulated; MIT licensed).
