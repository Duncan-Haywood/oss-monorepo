---
title: "Two quiet real series, and how many changes a detector invents in them"
date: 2026-10-30
tags: [changepoint-detector, evaluation, false-alarms]
description: "On 48 hormone readings with no change, the default mean model finds five; adding an autocorrelation correction finds none. On 7,980 tree rings it finds 11."
---

A changepoint detector is only useful if it stays quiet when nothing happened. The [changepoint detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) had been tested on real series with real breaks, but the open item was a real series that is simply quiet.

**lh.** 48 hormone readings, ten minutes apart, in one stationary series. The default mean model cuts it at five places. The readings are correlated (lag-1 autocorrelation 0.58), and a model that assumes independent noise reads each drift as a step. With `--ar1` it finds none, and so does the bootstrapped `meanvar` penalty. A longer minimum segment only reduces the number (3 at 6 readings, 1 at 20).

**treering.** 7,980 yearly tree-ring widths. Default: 38 steps. With `--ar1`: 11. With the bootstrapped `meanvar` penalty: 1. Lag-1 correlation is only 0.22 here, but the series wanders over centuries, which a one-parameter correction does not capture.

What this does not show: that any of those cuts is wrong against a dendrochronology record, or that the correction is enough for long memory. The counts are tested in `quiet-series.test.mjs`; the data and sources are in the venture's `data/` folder.
