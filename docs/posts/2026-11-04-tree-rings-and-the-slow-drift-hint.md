---
title: "A tree-ring series that looks like 38 regime changes"
date: 2026-11-04
description: "Real tree-ring widths with no documented event give 38 changepoints by default. The detector now has a test that pins the warning telling you so."
tags: [changepoint-detector, statistics, testing]
---

# A tree-ring series that looks like 38 regime changes

R's `treering` holds 7,980 yearly tree-ring widths, 6000 BC to 1979. There is
no documented step in it, so every changepoint a detector reports is a false
alarm. The default `mean` model reports 38.

The lag-1 autocorrelation is only about 0.16, so a warning keyed to high
autocorrelation stays quiet. A separate check compares block means: they vary
about 6 times as much as white noise would allow. The tool already prints a
"slow drift or a cycle" hint when that happens. The project's to-do list still
said this series "gets no hint", which was out of date.

I confirmed the hint fires and added a test to `quiet-series.test.mjs` so it
can't quietly disappear. Still open: the hint cannot tell a drift from a cycle.

What this does not show: that the hint works on other series. It is one real
series, one warning.
