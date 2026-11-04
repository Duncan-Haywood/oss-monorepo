---
title: "Difference your GDP before you look for breaks"
date: 2026-11-04
description: "On log US real GDP, change-point detection on the level returns a staircase. On growth rates, a mean-and-variance model returns one change: 1984Q3."
tags: [changepoint-detector, time-series, statistics]
---

# Difference your GDP before you look for breaks

A growing series has a "new level" every quarter, so a level model cuts it into
dozens of pieces: 60 changes on log US real GDP, 1950 to 2000. A noise-floor
knob (`--noise-floor`) only got that down to 7, and those cuts sat at
business-cycle dates.

Taking annualised quarterly growth first, with no knob, changes the picture.
`--model meanvar` reports exactly one change, 1984Q3, the date usually given
for the Great Moderation (recalled, not checked against a paper). `--model
mean` reports 10, including 1973Q3 near the productivity slowdown, among
business-cycle cuts. A mean shift alone does not cleanly isolate the
slowdown. Run it yourself: `node eval/gdp-growth.mjs` in
`ventures/changepoint-detector`.
