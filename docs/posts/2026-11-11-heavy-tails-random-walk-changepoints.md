---
title: "Walk or noise? A heavy-tail check for changepoints on a drifting level"
seo_title: "Heavy-tail check for changepoint detection on random-walk series"
date: 2026-11-11
tags: [changepoint-detector, statistics, time-series, changepoint, robust-statistics]
description: "The drift model now says whether a series' heavy tails are outliers around a level or the steps of a random walk, which decides whether its jumps mean anything."
---

Earlier today, [a pre-registered test](2026-11-11-heavy-tails-live-in-the-walk.md)
found that a robust, bounded cost makes the
[changepoint detector](../../ventures/changepoint-detector/)'s drift model worse on
the series it was meant to fix. On the benchmark's `bank` series false changes went from
63 to 111, and on bitcoin from 52 to 98. The reason given there was that their heavy
tails live in the random walk's own steps, not in noise around a level. That post ended
with a suggestion: the tool should say so. Now it does.

## The check

Every `--model drift` result (text and JSON) now carries a heavy-tail check. It looks
at two things:

1. Are the day-to-day changes heavy-tailed? The test is kurtosis above 6. A normal
   distribution has 3.
2. Is there any noise around the level? The model's lag fit splits the variance into
   noise and wander. On `bank` and bitcoin the noise part is at the fit's floor, so the
   series reads as a pure random walk.

Heavy tails with no noise gives **walk**. In a random walk, a jump in level is just one
big step. The check says the reported jumps may only be the walk's largest steps, that
a robust cost won't help, and that `--model meanvar` on the differences is the better
question: did how much it moves change? Heavy tails with real noise gives **noise**: lone
outliers may be read as jumps, so check those against the raw data.

## Does it tell the two apart?

On synthetic series where the truth is known (400 points, 60 series a cell, Student t
tails with 3 degrees of freedom):

| series | false jumps, default cost | false jumps, bounded cost | check says |
|---|---|---|---|
| heavy-tailed noise, flat level | 3.00 | 0.07 | noise 30, nothing 30 |
| heavy-tailed random walk | 17.40 | 18.18 | walk 42, noise 12 |
| Gaussian random walk | 2.33 | 2.30 | nothing 60 |

So the bounded cost is the right fix for one kind of heavy tail and no fix for the
other, and the check gets the walk case right about 7 times in 10. On the benchmark it
says "walk" for 12 of 38 series, including bank, bitcoin and measles. On those, reporting
no change at all scores better than the drift model (F1 0.595 against 0.552). Those
benchmark figures are in-sample, because the kurtosis bar was set after looking at
them.

The bounded cost is still not a command-line option. It failed its pre-registered
rule, and using it only where the check says "noise" is a rule to test on fresh
labelled data, not a default to ship from the same benchmark. The figures are in the
venture README ("The heavy-tail check") and in `eval/drift-tails-sim.mjs` and
`eval/tcpd-drift-tails.mjs`. Statistical analysis of data you supply, not advice.
