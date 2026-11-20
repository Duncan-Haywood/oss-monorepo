---
title: "Why a ten-cycle battery fade forecast gets worse when lithium plating is faster"
seo_title: "Ten-cycle battery fade forecasts and self-throttling Li plating"
date: 2026-11-20
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "In 288 PyBaMM DFN designs, faster lithium plating slows itself within 100 cycles. That bends the fade curve, and a longer look does not straighten it."
---

The [cell-fidelity programme](../../research/cell-fidelity/) forecasts how much lithium a cell
design will have lost by cycle 99 from its first ten cycles. A battery design search uses that
forecast to decide which designs deserve a longer, more expensive simulation. The
[last run](2026-11-20-the-battery-triage-interval-did-not-survive-a-second-plating-rate.md)
ended on a puzzle. On two PyBaMM cells, `Mohtat2020` and `Ecker2015`, whose plating reaction
the programme speeds up so that they fade like the others, tripling the speed-up from 10 to 30
more than doubled the forecast's median error (0.045 to 0.105 and 0.098 to 0.249). The obvious
guess is that ten cycles is too short a look once a cell fades fast.

This run tested that guess on data already on disk: 288 designs from three earlier steps, no new
simulation, with the hypotheses committed before the numbers were computed
([log, milestone 7t](../../research/cell-fidelity/LOG.md)).

## The plating reaction slows itself

For each design I took the lithium plated per cycle over cycles 90 to 99 and divided it by the
rate over cycles 2 to 10. Call it the throttle, T. A value of 1 means plating runs at a steady
rate; below 1 means it slows down.

| cell | multiplier | median T | median drift m | median ten-cycle error |
|---|---|---|---|---|
| Mohtat2020 | 10 | 0.555 | 1.006 | 0.043 |
| Mohtat2020 | 30 | 0.297 | 0.806 | 0.105 |
| Ecker2015 | 10 | 0.510 | 0.907 | 0.087 |
| Ecker2015 | 30 | 0.239 | 0.610 | 0.243 |

The drift m measures how far the fade law's late rate departs from its ten-cycle slope (1 means
the straight line holds). At the faster rate, plating late in the run is a quarter to a third of
what it was early. Within each cell that drifts, designs that throttle more drift more: Spearman
+0.83 to +0.88, permutation p below 0.001. The one exception is `Mohtat2020` at 10, where the
median m is 1.006 and there is almost no drift to explain. Across all eight cell-and-rate
combinations, including four parameter sets with no tuning, the median throttle orders the median
drift (&rho; = &minus;0.81, p = 0.024). Inside every combination, the forecast error tracks the
drift (Spearman +0.79 to +0.99).

## A longer look does not fix it

If the trouble were only a short look, extending it should bring the error back down. It does
not. At multiplier 30 the median error at a 50-cycle look is still 0.061 on `Mohtat2020` and 0.131
on `Ecker2015`. That is worse than the ten-cycle error at multiplier 10 (0.043 and 0.087). The
bend runs all the way to cycle 99, so a longer straight line only chases it.

A rule that scaled the look to the share of fade already seen would go the wrong way. A cell
that throttles has seen 15 to 17% of its 99-cycle loss by cycle 10, against 11 to 12% at the
slower rate, so that rule would stop at about 8 cycles.

## What this means for the design-search recipe

The fix for throttling cells is a curved forecast whose bend comes from an early sign of the
throttle, not more cycles. An earlier step tried borrowing a curvature from other designs on
LG M50 cells and it failed, because there the bend went either way by 5 to 10%. Here it is
one-signed and ordered by T, which gives the curved term something to stand on. That is the next
step: an early throttle observable, fitted with one design pool held out at a time.

Limits: T and the fade come from PyBaMM's plating and SEI submodels at one version, so the
throttle belongs to the simulated reaction, not a measured cell. T uses cycles 90 to 99, so it
explains the drift after the fact rather than forecasting it. Eight combinations is a small
sample, and two of them are the same chemistry at two rates. Results:
[`experiments/bend7t/results.txt`](../../research/cell-fidelity/experiments/bend7t/results.txt).
