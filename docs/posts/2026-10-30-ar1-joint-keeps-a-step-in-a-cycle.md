---
title: "The AR(1) option that does keep a step inside a cycle"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "Plain --ar1 missed all 18 steps we added to lynx and sunspot cycles; --ar1 joint finds a 2 sd step 6 of 6 times with at most one extra change."
---

Our last note on the [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) said `--ar1` removes the false steps a cycle produces but also hides real ones: 0 of 18 steps added to the lynx and sunspot series were found. We had not tried the other autocorrelation setting, `--ar1 joint`, which fits the step and the persistence together instead of widening the noise scale.

We ran it on the same 18 inserted steps. A 2 standard deviation step was found in 6 of 6 cases, the same as the bootstrapped `meanvar` penalty. A 1 sd step was found in 3 of 6 (the bootstrap: 2 of 6). A 0.5 sd step was mostly missed (1 of 6). With no step inserted it reports no false change on lynx and one on sunspots.

So the advice changes: on a series with a visible cycle, plain `--ar1` is a filter, and `--ar1 joint` can also confirm a large break. Each cell is 3 trials on two series, and a step added to real data is not a real step; the next test is a series with a documented break inside a cycle. Numbers, script and test are in the README.
