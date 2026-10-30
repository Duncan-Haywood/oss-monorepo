---
title: "Prewhitening does not fix a cycle: an AR(2) negative result"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "Whitening lynx and sunspots with AR(1) or AR(2) coefficients before step detection still leaves 16 to 34 false steps; the exact likelihood is needed."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) reads each swing of a cycle as a step: 23 false steps on lynx trappings and 46 on sunspots. Its `--ar1` option fixes that with an exact one-lag likelihood. The open question was whether a cheaper route works for a two-lag cycle: estimate AR(1) or AR(2) coefficients, whiten the series, and run the ordinary mean fit.

It does not. Iterated three times and seeded with a robust rho, lynx kept 21 (AR1) and 22 (AR2) false steps and sunspots 34 and 16, against 0 for `--ar1`. Unseeded it is worse, because the first pass cuts the cycle into steps whose residuals look white, so the fitted coefficients collapse towards zero. Inserted 1 and 2 sd steps were found in 0 of 6 cases in every cell, so the failure is not hiding any power either.

The lesson for the tool: the AR term has to sit inside the segment cost, as `ar1mean` does, not in a pre-processing step. The script is `eval/ar2-prewhiten.mjs` and the README holds the table.
