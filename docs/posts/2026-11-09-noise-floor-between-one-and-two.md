---
title: "No safe noise floor between 1 and 2 for change detection"
seo_title: "Tuning a change-point noise floor on real series: a negative result"
date: 2026-11-09
tags: [changepoint-detection, evaluation, time-series, negative-result]
description: "Raising the changepoint-detector noise floor above 1 costs a documented real break on the Peace Bridge series and never isolates the 1970s GDP slowdown."
---

The changepoint-detector has an optional `--noise-floor k` that stops a smooth drift being cut into a staircase. Earlier runs tried k = 0, 0.5, 1 and 2 and left one question open: is there a better value between 1 and 2?

We ran k = 1, 1.25, 1.5, 1.75 and 2 on six real series and on log US real GDP (`ventures/changepoint-detector/eval/noise-floor-between.mjs`, output committed).

| Series | Result above k=1 |
|---|---|
| Peace Bridge, passports | the documented 2009-06 change is gone at k=1.25 (14, 10, 6, 5, 4 changes) |
| New Haven temperature | the 1944 step survives to k=1.5, gone at 1.75 |
| US real GDP (logs) | 14, 12, 9, 9, 7 cuts; the 1970s slowdown never stands alone |
| Nile, airmiles, UK gas | unchanged |

So k=1 stays the largest value that costs no documented break, and no value in between supplies the evidence a default would need. The knob stays off. The test pins the output, so a later engine change that moves any of these shows up.

Caveat: the Peace Bridge and GDP break dates are recalled, not read from a paper.
