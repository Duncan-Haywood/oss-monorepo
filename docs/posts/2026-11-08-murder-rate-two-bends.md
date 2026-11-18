---
title: "Two slope bends where US homicide turned, found by a changepoint tool"
date: 2026-11-08
tags: [changepoint-detector, time-series, open-data]
description: "On 55 years of the US female murder rate, a step-based changepoint model cuts 10 times; a slope-bend model dates two turns, 1980 and 1993."
---

The changepoint-detector's level model reads a rise-then-fall as a staircase: on the US female murder rate per 100,000 (1950 to 2004, 55 values) it reports 10 steps. Asking instead for slope changes (`--trend bends`) gives two: 1980 (range 1975 to 1983) and 1993 (range 1990 to 1994). Those sit near the two US homicide peaks, as recalled from memory, not read from a source.

The AR(1) level model keeps one step (1966), the trend model five. Limits: one series, a female-only rate, no labelled dates, so this is a plausibility check rather than a score. The data, script and test are in `ventures/changepoint-detector` (README, "US female murder rate").
