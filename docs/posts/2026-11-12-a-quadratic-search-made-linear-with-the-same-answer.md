---
title: "Making a changepoint check 20 times faster without changing a single answer"
seo_title: "Fast PELT on long binary series: grid search plus exact refinement"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, pelt, time-series, performance]
description: "The Changepoint Detector's update-rate check now runs beside every model. Wiring it in exposed an n-squared search; a grid plus exact refinement matched the exact answer on 200 of 200 long series."
---

Earlier today the [Changepoint Detector](../../ventures/changepoint-detector/)
learned to say when a series [started updating less often](2026-11-12-when-did-this-series-stop-updating.md):
when the share of values that exactly repeat the one before changed, which is
what a stale price feed or a figure carried forward looks like. It only ran with
the wandering-level model. Since it reads nothing but the values, it belongs
beside every model, so this run wired it into the default analysis, the page's
"Read with care" notes and the branded report. On Florida frozen orange juice,
the plain level model now says what the drift model said: repeats fell from 60%
of months to 12% around August 1981.

## The cost that came with it

Running it on every series exposed a problem. The check uses PELT, optimal
partitioning with pruning, on a 0/1 series (did this step repeat?). PELT is
linear when changes are spread through the data, but on a series with one
change or none it can prune almost nothing, and the search grows with the
square of the length: 24 seconds at 20,000 points, 48 on a steady series, and
a 100,000-point series did not finish in two minutes. The same was already
true of `--model drift`.

The fix is old and simple. Above 1,500 steps, search for cuts only on a grid of
about 1,500 positions. Then take each cut and, holding its neighbours fixed,
move it to the best position anywhere between them, repeating until nothing
moves. Each move can only lower the cost.

## Did it change any answers?

Before running it, the rule went into the repository with the code: on 200
simulated series of 4,000 and 8,000 steps (no change, a switch, a fixed stale
feed, a switch and back), the grid had to report the same number of changes as
the exact search in at least 18 of 20 series in every cell, and put at least
95% of its changes inside the exact change's date range.

It reported the same number of changes in all 200, and put all 160 changes
at exactly the same step as the exact search. Total time: 14 seconds against 303.
A 100,000-point series now takes about 0.15 seconds.

That is a simulation result, not a proof: a series with many changes close
together could, in principle, catch the grid out. The 1,500-step limit keeps
every series the method was calibrated on (100 to 600 steps) on the exact search.

Code and numbers: `ventures/changepoint-detector/update-rate.mjs`,
`eval/update-rate-long.mjs` and its `.out.txt`, README "The update-rate check
beside every model". The tool is free and MIT licensed; its results describe the
data and are not professional advice.
