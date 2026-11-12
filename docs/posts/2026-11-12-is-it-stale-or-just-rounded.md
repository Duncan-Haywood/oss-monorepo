---
title: "Stale or just rounded? A test that almost worked, twice"
seo_title: "Telling a stale data feed from rounding in a time series"
date: 2026-11-12
tags: [changepoint-detector, time-series, data-quality, stale-data, rounding, pre-registration, negative-result]
description: "A pre-registered check for telling a one-tick stale feed from a rounded slow series failed two rounds, one by a single series. Here is the trade-off it measured."
---

A series that repeats its last value can mean two different things. Either
nobody refreshed the figure (a stale feed, a price carried forward), or the
thing really moved less than the precision it was recorded to (a slow index
stored to 0.1). The [Changepoint Detector](../../ventures/changepoint-detector/)'s
update-rate check already tells most cases apart by how big the moves are: if
at least half the moves in the stickier stretch are a single tick, it says the
repeats may only be rounding. Its README admitted the hole. A stale feed whose
real moves are themselves about one tick passes that test too, so it gets
called rounding.

## The idea

Look at the move that *ends* a run of repeats. A rounded slow walk leaves a run
by crossing the next rounding boundary, so that move is still about one tick
however long the run was. A stale figure catches up on every step it skipped,
so after k repeats its move has about k + 1 times the variance. The statistic
is the mean squared move ending a run of repeats, divided by the mean squared
move that follows an ordinary move. It comes out near 1 for rounding and about
2 to 4 for a one-tick stale feed.

## Two rounds, both written down first

Each round's pass rule was committed before its confirmation seed ran. On 300-step
simulated series with a change halfway through:

- **Round one** (runs of 2 or more, ratio 1.4): it caught 90 to 96% of the
  one-tick stale feeds. But a rounded walk of 0.6 ticks a step was called
  stale in **6.0%** of series, and the bar was 5%. Fail.
- **Round two** (setting picked on a fresh calibration seed with a 2.5% ceiling
  for false calls; runs of 3 or more, ratio 1.8): false calls fell to 1.5%, and
  two stale cells passed at 85%. The third caught **79.5%**, 116 of 146, against a
  bar of 80%. Fail, by one series.

There is no third round. Tuning again on the same cells until something passes
is exactly the forking path these rules exist to stop. So the check is not
offered: every sentence the tool writes is unchanged, and each change only
carries the ratio as a plain number.

## What it did show

The two rounds bracket a real trade-off. With about 300 steps a stretch holds
too few catch-ups for this statistic to give both 90% power and a 5% false-call
rate. On real data it behaves as the reasoning says: the producer price index
in the frozen orange juice file, a rounded series, has a ratio of 0.48. The
move that ends a run there is *smaller* than a typical move. The juice price
itself (already called stale on move size) comes in at 1.73: catch-ups larger
than ordinary moves, but less than a carried-forward random walk predicts. Why
is an open question.

Next: a power curve in series length, which would show where one setting could
pass both bars, or a proper likelihood comparing a rounded walk with a rounded
walk carried forward. The tables, the code and both rules are in the
[README](../../ventures/changepoint-detector/README.md) under "One-tick stale
feeds".

*The Changepoint Detector is free and open source (MIT). Its output describes
data; it is not financial, scientific or professional advice.*
