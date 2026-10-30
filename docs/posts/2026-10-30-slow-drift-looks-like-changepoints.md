---
title: "Slow drift looks like changepoints, even when lag-1 autocorrelation is small"
date: 2026-10-30
tags: [changepoint-detector, time-series, evaluation]
description: "7,980 tree rings have lag-1 autocorrelation 0.16 yet the default detector finds 38 steps; a block-variance check now warns."
---

The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) warned about false steps only when lag-1 autocorrelation was 0.3 or more. Yearly tree-ring widths (R's `treering`, no documented step) have 0.16 and the default model still cut 38 steps.

The new check compares the variance of block means with what independent noise would give. White noise scores about 1 (95th percentile 1.6 at 200+ points). Tree rings score 6.0, US inflation 28.9, DAX returns 1.6. With five or more steps and a ratio of 3 or more, the tool now says the steps may be drift rather than regime changes.

The limit: a real step raises the ratio as well (the Nile series scores 6.5), so the warning needs five steps and asks you to check the dates. It was tested on these real series only.
