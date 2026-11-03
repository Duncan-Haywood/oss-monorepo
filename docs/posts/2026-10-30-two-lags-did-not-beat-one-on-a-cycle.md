---
title: "Two lags did not beat one: an exact AR(2) fit on lynx and sunspots"
seo_title: "AR(2) versus AR(1) noise in changepoint detection on cycles"
date: 2026-10-30
tags: [changepoint-detector, evaluation, time-series]
description: "We scored level shifts under exact AR(2) noise to stop a cycle reading as steps. It matched AR(1) after a log transform and did worse before it."
---

Yearly sunspot numbers and Canadian lynx trappings swing on a roughly ten-year cycle. A changepoint detector that assumes independent noise reads each swing as a step. The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) already has an AR(1) option, but a cycle needs two lags to describe, so we built an exact AR(2) likelihood inside the PELT search and compared the two.

On raw lynx the AR(2) fit reported 9 changes and the AR(1) fit none. On raw sunspots it reported 3 against 1. On 40 simulated AR(2) series with no step it found 0.38 changes each against 0.00. The extra freedom pushed the fitted lag toward the edge of the grid and absorbed the misfit as steps. After a log (lynx) or square root (sunspots) it matched AR(1): 0 and 1 changes. It took about seven times as long.

With a 2 standard deviation step added, AR(2) found it 40 times in 40 runs and AR(1) 39, a gap that 40 runs cannot tell from noise. So `--ar1` stays the default for cycles, and the code is in the engine, off, with its measurements in the README. The transform mattered more than the lag order. A real documented step inside a cycle is still the missing test.
