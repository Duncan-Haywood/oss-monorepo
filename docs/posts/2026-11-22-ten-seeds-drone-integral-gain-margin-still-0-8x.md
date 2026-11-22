---
title: "Ten seeds on a drone tuner's stability margin: 0.8× holds, and unconstrained tunes crash at their own limit"
seo_title: "Drone tuner stability margin at ten seeds: 0.8× holds"
date: 2026-11-22
tags: [research, drones, codesign-cant, control, statistics, reproducibility]
description: "At ten seeds, keeping a quadrotor's integral gain at 0.8× its linear ceiling still stops crashes at a 45° tilt limit. Two unconstrained tunes crashed at 20°."
---

The [codesign-cant](../../research/codesign-cant/) programme co-designs a small
quadrotor's motor cant, frame and controller gains with CMA-ES. Section VI of
its paper draft says something a builder can use. If you add a feed-forward that
cancels the canted rotors' side force, the tuner pushes the attitude integral
gain onto the loop's stability boundary. Keeping that gain at 0.8× the ceiling an
11-state linear model computes stops the crashes this causes when the autopilot's
tilt limit is opened from 20° to PX4's default 45°.

That table rested on six seeds per arm. The day before, the programme's first two
milestones went from five seeds to ten
([post](2026-11-21-five-seeds-said-cant-pays-more-ten-seeds-disagree.md)), and
one of their claims was withdrawn. So this run did the same for section VI. It
trained seeds 6 to 9 of all six arms with the same code: 48 CMA-ES runs, 51
minutes on four cores. Eight predictions were committed before the run, and three
reproduction checks had to match the stored numbers exactly before anything new
was read. All three matched.

## What held

The rule holds. Here are the held-out flights that diverged at a 45° tilt limit,
out of 640, as the integral-gain bound is tightened:

| bound (× linear ceiling) | none | 1.0 | 0.9 | 0.8 | 0.7 | 0.6 |
|---|---|---|---|---|---|---|
| six seeds (of 384) | 13 | 9 | 3 | 0 | 0 | 0 |
| ten seeds (of 640) | 31 | 19 | 6 | 1 | 1 | 0 |

From 0.8× down, every arm beats the unconstrained tune in all ten seeds. The
Wilcoxon p is 0.002, the smallest ten pairs can give. 0.9× still lets six flights
diverge, and requiring only that every corner of the plant box is stable (1.0×)
removes about two fifths of the crashes. At twice the trained centre-of-pressure
lever, 23 of 640 flights diverge at 0.8×, 0.7× and 0.6× alike. That floor is a
thrust-headroom limit, which milestone 7g traced, and no gain margin moves it.

## What changed

The six seeds had a clean story: unconstrained tunes are fine at the 20° limit
they were trained at, and the margin is insurance for a looser autopilot setting.
The ten seeds break that story. Two of the four new unconstrained designs each
diverge on one of their 64 held-out flights at their own training condition.
None of the 50 constrained designs does.

This also breaks the prediction about price. The draft said the margin costs
about 0.7% of held-out cost. Averaged over all ten seeds it costs nothing: the
two crashing unconstrained tunes drag their arm's mean down so far that every
constrained arm comes out ahead. That prediction (MB2) is recorded as refuted. The
price is still there where it can be measured. Over the eight seeds whose
unconstrained tune never crashed, 0.8× costs 0.012 in cost (0.8%, 95% interval
0.008 to 0.016, worse in 8 of 8, p = 0.008). That comparison was chosen after
seeing the data, and the paper labels it so.

## For a builder

Add the linear stability check to the tuning loop and keep the integral gain at
0.8× its ceiling. The reason is not only that you might fly at 45° later. In this
simulator, one in five tunes left on the boundary already crashes now and then at
the limit it was tuned for.

All of this is simulated, with one airframe geometry and 64 held-out flights per
design. The numbers are in
[`experiments/m12b_ten_seeds_vi/stats.txt`](../../research/codesign-cant/experiments/m12b_ten_seeds_vi/stats.txt),
and the predictions and their verdicts are in the programme's
[log](../../research/codesign-cant/LOG.md).
