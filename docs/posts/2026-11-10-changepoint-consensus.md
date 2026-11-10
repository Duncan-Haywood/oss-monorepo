---
title: "Six changepoint settings, one list: which changes do they all agree on?"
seo_title: "Changepoint detection consensus across settings"
date: 2026-11-10
tags: [changepoint-detector, time-series, statistics]
description: "No one changepoint setting is right on every series, so changepoint-detector now runs six and reports how many agree on each change, with the simulation that measures what that buys."
---

Changepoint tools make you choose: plain level model, autocorrelation allowance,
a noise floor, a trend. We measured these choices on series with one known
step and a steady drift, and each wins somewhere and loses somewhere. The plain
level model cuts the drift into a staircase; the simple AR(1) setting loses the
step as autocorrelation rises.

`changepoint-detector --consensus` runs a panel of six settings and lists each
change with how many of them found one near that point.

On 60 simulated series per cell (120 points, drift, one step of 4 noise
standard deviations):

- changes **every** setting finds were almost never false (0.00 to 0.02 other
  cuts per series), but the step was lost in up to 35 of 60 series once
  autocorrelation was strong;
- changes found by **half or more** caught the step in 60 of 60 series in every
  cell, with fewer false cuts than the trend model alone when autocorrelation was
  medium or high (1.95 against 3.62 at phi 0.5, 3.67 against 5.93 at phi 0.8).

It is not better than the right single setting. If you know the autocorrelation,
`--ar1 joint` alone is cleaner. Consensus is for when you do not.

On a smooth real series (US GDP, Australian population) it does not remove the
staircase: GDP still has 13 changes found by half or more of the settings, and we say so in the README.
On the Nile flow series, all six agree on 1899.

It is in the command-line tool, free and MIT licensed. The simulation is in
`eval/consensus-sim.mjs` and is seeded, so you can rerun it.
