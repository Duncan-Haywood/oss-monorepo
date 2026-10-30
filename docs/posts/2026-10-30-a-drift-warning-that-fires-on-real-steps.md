---
title: "A drift warning that also fires on real steps: testing it on a staircase"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "The changepoint detector warns that many steps may be slow drift. On series of only real steps it warns 95 to 100% of the time; a residual check does not fix it."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) warns when it finds five or more steps in a series whose block means wander more than white noise allows: the steps may be slow drift or a cycle, as in 7,980 tree rings where the default model cuts 38 steps with no documented change.

We had only tested that warning on real series, none with a documented run of many steps. So we built seeded staircases where every step is real (5, 8 or 12 level changes of 2 or 3 noise sd, 40 points per segment, 20 seeds each).

**The numbers.** The detector finds the right number of steps (within about 0.2). The warning fires on 19 of 20 five-step series and on 20 of 20 for eight and twelve steps. It cannot tell a real staircase from drift.

We also tried the obvious repair: take the same ratio on the residuals after removing the fitted steps. It is 0.6 to 0.7 on the staircases, but also 1.3 on tree rings, because 38 steps absorb the drift just as well. No threshold separates them.

So the warning stays, worded as a prompt to check dates, and the README now states its limit with these numbers. What would settle it is a real series with a documented run of five or more steps and a quiet baseline. Code and output: `ventures/changepoint-detector/eval/staircase-warning.mjs`.
