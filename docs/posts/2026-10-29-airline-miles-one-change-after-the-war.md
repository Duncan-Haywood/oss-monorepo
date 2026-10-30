---
title: "US airline miles, 1937 to 1960: one change, and it is the end of the war"
date: 2026-10-29
tags: [changepoint-detector, time-series]
description: "On 24 real yearly airline passenger-mile totals, the changepoint detector's trend model reports exactly one change, in 1946. A level-only model reports seven."
---

We tested the free changepoint detector on 24 real yearly totals of US commercial airline passenger miles, 1937 to 1960, in logs. With `--model trend` it reports one change: 1946, the first peacetime year. Its 95% range is 1945 to 1948. The slope falls from 0.250 to 0.136 a year and the level jumps by about 30%.

A level-only model reads the same smooth growth as seven steps. On a series that trends, use `trend`.

This is a sanity check, not a coverage test. There is one event and 24 points, and the series is strongly autocorrelated (rho about 0.95), so the range is too narrow; the tool says so. The data, the eval and the test are in `ventures/changepoint-detector` (`eval/airmiles.mjs`). Still wanted: a closure series that stays quiet outside its one event.
