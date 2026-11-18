---
title: "Why one noise knob cannot find the 1970s GDP slowdown"
date: 2026-11-04
description: "On log US real GDP, no value of the changepoint detector's noise floor isolates the 1970s productivity slowdown: 60, 40 or 26 cuts, or 20, 14 or 7."
tags: [changepoint-detector, time-series, statistics]
---

# Why one noise knob cannot find the 1970s GDP slowdown

A changepoint detector reads a growing series as a staircase: every quarter of growth looks like a small step. The changepoint-detector project has a `--noise-floor k` option that sets the noise scale to at least k times the typical step between neighbours, so steady growth stops counting as scatter.

We had tested it on six real series, none of them drifting with a known break. Today we ran log US real GDP, 1950 to 2000, where the early-1970s productivity slowdown is the break everyone cites.

| k | changes, level model | changes, level-or-slope model |
|---|---|---|
| 0 | 60 | 20 |
| 1 | 40 | 14 |
| 2 | 26 | 7 |

At k=2 the nearest cut to the slowdown is 1974Q4, sitting among six others at business-cycle dates. GDP drifts and cycles, and a single noise floor cannot tell the two apart. We also know from the other six series that k=2 deletes documented breaks elsewhere.

So the knob stays off by default. The honest next step is a trend fitted under the steps, not a bigger k. The data, script and test are in `ventures/changepoint-detector` (`eval/noise-floor-gdp.mjs`). The 1973 break is recalled from the literature, not checked against a paper, so this is a plausibility check, not a labelled test.
