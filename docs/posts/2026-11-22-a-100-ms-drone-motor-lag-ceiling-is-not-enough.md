---
title: "Below the knee: a 100 ms motor-lag ceiling is not enough for a drone tuner"
seo_title: "Drone motor-lag randomisation: 100 ms ceiling loses to 125 ms"
date: 2026-11-22
tags: [research, drones, codesign-cant, statistics, reproducibility]
description: "At ten seeds, a quadrotor tuned over motor lags up to 100 ms crashes 1.66 times as often as one tuned to 125 ms, to save 3-4% of mass."
---

The [codesign-cant](../../research/codesign-cant/) programme tunes a small
quadrotor's gains with CMA-ES while it randomises the plant. One randomised
input is motor lag. Two published identifications of 5-inch quadrotors put it
at 33 and 39.1 ms. Training draws lags from the slow identification up to a
ceiling, and the question all day has been where that ceiling should sit.

Two earlier runs today took the knee of the ceiling sweep to ten seeds per
centre-of-pressure geometry. 125 against 150 ms separated (p = 0.004).
150 against 200 ms did not (p = 0.08). That left one six-seed row in the knee
region: 100 ms, 2.6 times the slow identification. At six seeds it crashed
191 times against 125 ms's 101 (of 2,304 flights), p = 0.025.

## Four more seeds, predictions first

This run trained seeds 6 to 9 of the 100 ms arm in both geometries and changed
nothing else: 16 CMA-ES runs of 3,200 evaluations, 70 minutes on four cores.
Nine predictions went into the log and were committed before the full run.
A retrained seed-0 run matched its stored training score to the last digit,
and every re-scored old design matched its stored numbers.

All nine held. Over the identified lags (33, 36 and 39.1 ms), at twice the
trained centre-of-pressure lever and a 45° tilt limit:

| ceiling | crashes of 3,840 | 95% interval |
|---|---|---|
| 100 ms | 326 | 243-416 |
| 125 ms | 196 | 156-242 |
| 150 ms | 112 | 90-138 |
| 200 ms | 86 | 68-105 |

100 against 125 ms gives a pooled Mann-Whitney p of 0.04. Paired by geometry
and seed, 100 ms crashes more in 17 of 20 pairs (exact Wilcoxon p = 0.001).
At a 75 ms motor, slower than either identification, it is 893 against 695
of 1,280.

One caveat: the four new seeds alone do not show the gap (135 against 95,
p = 0.72). One of the new 100 ms designs is among the best of either arm.
The ten-seed pooled and paired tests carry the result; four seeds would not.

## What the cheaper ceiling buys

Less than you might hope. The 100 ms designs are 3-4% lighter (median 1.42
against 1.48 kg with the centre of pressure above, 1.37 against 1.41 kg
below) and rise to 90% of a 1 m step 0.1-0.15 s sooner. That is the trade:
1.66 times the crashes at the measured lag for a few percent of mass.

For a builder the rule from the last two runs stands: set the training
ceiling at about four times the slowest identified motor lag. 2.6 times is
not enough, and past four times the gain at the measured lag is too small to
detect.

Everything here is simulated, with one held-out seed of 64 episodes per
design and law. The numbers are in
[`stats.txt`](../../research/codesign-cant/experiments/m12e_ten_seeds_c100/stats.txt),
and the predictions and outcome are in the programme's
[log](../../research/codesign-cant/LOG.md).
