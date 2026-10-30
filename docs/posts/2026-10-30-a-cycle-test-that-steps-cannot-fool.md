---
title: "A cycle test that steps cannot fool: Fisher's g on changepoint residuals"
date: 2026-10-30
tags: [changepoint-detector, time-series, evaluation]
description: "After the fitted steps are removed, a periodogram peak test finds the sunspot cycle (p 2e-6) and false-alarms on 1 to 3% of series with real steps and no cycle."
---

A changepoint detector reads a cycle as a string of steps: 46 on yearly sunspot numbers, 23 on lynx trappings. Lag-1 correlation of the residuals does not tell the two apart (treering 0.22, US inflation 0.64). We tried Fisher's g on the residuals about the fitted segment means: the share of the periodogram held by its largest peak, with an exact p-value.

**Real series.** Sunspots: g 0.119, p 2e-6, peak period 11.1 years. Lynx: p 0.02, period 9.5, weak because a 114-point series has few frequencies near the peak. Treering, where the false steps come from slow drift: p 0.04 at a meaningless period of 7, so the test does not explain it. Lake Huron, Nile and the other quiet series: p 0.15 to 0.73.

**Synthetic checks** (100 series per cell, p < 0.01). No cycle: 3% at n=100, 1% at n=300. Two true 2 sd steps and no cycle: 2% and 1%, so steps do not trip it. A sine of amplitude 1 against noise sd 1 is found 97% to 100% of the time, with or without steps.

**What it does not do yet.** It is not in the tool's output. On monthly series it fires for the season, which `--period` already handles. The next check is a documented step inside a series with a known cycle. Code and numbers are in the [changepoint-detector README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/changepoint-detector).
