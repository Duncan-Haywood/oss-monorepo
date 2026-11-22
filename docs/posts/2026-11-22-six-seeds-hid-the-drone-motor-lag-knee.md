---
title: "Six seeds hid it: train a drone's motor lag to 150 ms, not 125"
seo_title: "Drone motor-lag randomisation: 150 ms beats 125 ms at ten seeds"
date: 2026-11-22
tags: [research, drones, codesign-cant, statistics, reproducibility]
description: "At ten seeds, a quadrotor tuned over motor lags up to 150 ms crashes 43% less than one tuned to 125 ms (p = 0.004), a gap six seeds could not show."
---

The [codesign-cant](../../research/codesign-cant/) programme tunes a small
quadrotor's gains with CMA-ES while it randomises the plant. One of those
randomised inputs is motor lag. Two published identifications of 5-inch
quadrotors put it at 33 and 39.1 ms. The programme already found that the
right training range starts at the slow identification and runs well past it.
The open question was how far past.

At six seeds per centre-of-pressure geometry, the ceiling sweep left one
decision open. Draws from 39.1 up to 125 ms (3.2× the slow identification)
gave 101 stress crashes over the identified lags (of 2,304 flights). Draws up
to 150 ms (3.8×) gave 65. A pooled Mann-Whitney test gave p = 0.10. The draft
paper read that as "125 ms gets most of the way". It recommended 125 ms,
because 150 ms tunes rise more slowly on a set-point step.

## Four more seeds

This run trained seeds 6 to 9 of both arms in both geometries and changed
nothing else: 32 CMA-ES runs of 3,200 evaluations each, about two hours on
four cores. Eight predictions went into the log before the full run. Two
retrained seed-0 runs matched their stored training scores to the last digit,
and every re-scored old design matched its stored numbers.

The two ceilings now differ:

| ceiling | identified-lag crashes (of 3,840) | at a 75 ms motor (of 1,280) | median rise, 1 m step (above, below) |
|---|---|---|---|
| 125 ms | 196 (95% interval 156–242) | 695 | 1.68 s, 1.73 s |
| 150 ms | 112 (89–138) | 462 | 2.08 s, 1.83 s |

The pooled test now gives p = 0.004. Both arms share CMA-ES seeds and
training episodes, so they can also be compared pair by pair. There, 125 ms
crashes more in 17 of 20 (geometry, seed) pairs (exact Wilcoxon p = 0.00003).
The four new seeds alone repeat the pattern, 95 against 47. All 40 designs
pass the linear stability certificate at every identified lag.

## What changes

The builder rule in the draft's section VII changes from "set the ceiling at
3–4× the slowest identified lag" to "about 4×". A 125 ms ceiling is no longer
the default. It crashes 1.75 times as often for 0.1 to 0.4 s of faster rise,
so it suits only a builder who values rise time over those crashes. The extra
robustness from 150 ms was there at six seeds, but noise hid it.

One question is still open. At six seeds, 150 and 200 ms were not separated
either (p = 0.16), so the knee may be further out than 150 ms. The next step is
ten seeds at 200 ms. All of this is simulated. A hardware check (printed
motor mounts, a load cell, a yaw-rate log) is still the programme's last
milestone.

One small trap from the run: the in-run reproduction check compared response
records with `!=`. It flagged 27 of them because they held a NaN (an episode
that never settles), and a computed NaN never equals the stored one. A
NaN-aware re-check (`verify.py`) found no differences. Both outputs are in
the results, the log and the tests.

Code, data and the log: [`research/codesign-cant`](../../research/codesign-cant/),
milestone 12c.
