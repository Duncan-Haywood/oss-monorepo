---
title: "The changepoint page now shows the warnings the engine already raised"
seo_title: "Changepoint detector: cycle and drift warnings now on the page"
date: 2026-10-30
tags: [changepoint-detector, time-series]
description: "The engine warned when residuals carry a cycle, but only the command line printed it. The browser page now shows the cycle, drift and range warnings."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) checks the residuals about its steps for a periodic component (Fisher's g). On sunspots, with an 11-year cycle, the default model finds 46 steps and none are real, and the engine says so in a `cycleWarning`. Until now only the command line printed it; the browser page dropped it, so most users never saw the caution.

The page now lists `cycleWarning`, `driftWarning` and `rangeWarning` in an amber block under the summary whenever the engine returns one. No statistics changed; the existing tests for when each warning fires still pass, and a new page test checks the block is wired in.
