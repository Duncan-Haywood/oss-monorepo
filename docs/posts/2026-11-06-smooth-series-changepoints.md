---
title: "Does a changepoint detector cry wolf on smooth data? Two more real series"
date: 2026-11-06
tags: [changepoint-detector, time-series, evaluation]
description: "Two more real smooth series run through the changepoint detector: sales over-cut by 12 changes, one with AR(1) errors, and a census slowdown found."
---

A step detector that reports a dozen "changes" in a series where nothing happened is worse than none. We ran the changepoint-detector on two more real series with no documented step: 150 Box-Jenkins sales values and 19 US census counts, 1790 to 1970.

On the sales series the trend model reports 12 changes and the level-only model 25. Adding an AR(1) error term cuts that to one (at point 90, a 1.5-sd shift). A noise floor of 1 changes nothing here. On the census counts the trend model reports a single change, at 1890, where growth per decade halves in logs. That one matches a real slowdown, but it is a plausibility check, not a labelled test.

So over-cutting smooth drift is a general property, not an accident of one dataset, and autocorrelated errors are the cheapest fix we have measured. Code, data source and pinned output are in `ventures/changepoint-detector/` (`node eval/smooth-pair.mjs`).
