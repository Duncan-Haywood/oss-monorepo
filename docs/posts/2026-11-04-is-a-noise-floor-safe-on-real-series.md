---
title: "Is a noise floor safe on real series?"
date: 2026-11-04
description: "A changepoint detector's new noise floor fixes over-cutting on smooth growth curves. On six real series, a floor of 1 changes nothing and a floor of 2 starts deleting real changes."
tags: [changepoint-detector, statistics, evaluation]
---

# Is a noise floor safe on real series?

The changepoint detector over-cut a smooth growth curve (Australian population,
10 changes where nothing documented happened). The fix, `--noise-floor k`,
keeps the noise estimate at least `k` times the median step between
neighbours. A fix like that is only worth shipping if it leaves series with a
real break alone.

We ran k = 0, 0.5, 1 and 2 on six committed real series: Nile flow, Lake Huron,
Peace Bridge traffic, airline miles, UK gas and New Haven temperature.

- **k up to 1:** not one answer changed on any of the six.
- **k = 2:** Peace Bridge went from 14 changes to 4 and lost the documented
  2009 passport change. Lake Huron went from 10 to 5. New Haven's 1944 step
  disappeared.

So 1 is the largest value tried that is safe. We still have no drifting real
series with a documented break, so it stays off by default. Reproduce with
`node eval/noise-floor-real.mjs` in `ventures/changepoint-detector`.
