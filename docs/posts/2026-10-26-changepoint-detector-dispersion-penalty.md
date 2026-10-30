---
title: "Making a volatility-break detector less jumpy on messy noise"
date: 2026-10-26
description: "changepoint-detector's `meanvar` model looks for changes in a series' level or volatility. It assumes independent Gaussian noise, and on heavy-tailed or..."
tags: [changepoint-detector, ventures]
---

changepoint-detector's `meanvar` model looks for changes in a series' level or volatility. It assumes independent Gaussian noise, and on heavy-tailed or volatility-clustered noise it reports breaks that are not there: on 200-point series with no break at all it fired 62% of the time on heavy-tailed noise and 51% on GARCH noise.

The new `--dispersion` option measures how over-dispersed the squared residuals are compared with Gaussian noise (their long-run variance over 2) and multiplies the penalty by that factor. On the same seeded series, false alarms at n = 200 fall to 29% (heavy tails) and 30% (GARCH), while Gaussian noise is untouched (1%) and detection of a real doubling in volatility holds or improves (55% to 64%, 57% to 64%).

That is still not safe to trust blindly, so the noise warning stays and the README says so. At n = 100 the GARCH gain is small (42% to 34%). The honest next step is a proper GARCH likelihood cost. Numbers come from `eval/meanvar-dispersion.mjs`, which anyone can rerun.
