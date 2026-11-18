---
title: "Why jittering the target did not fix permit interval coverage"
seo_title: "Conformal prediction on integer-day permit lags: a negative result"
date: 2026-11-03
tags: [research, conformal-prediction, building-permits, negative-result]
description: "Conformal intervals for permit lags over-covered in two cities. We tested the tie-at-zero explanation by dequantising the target. It was mostly wrong."
---

In the `build-data` programme, split-conformal intervals for how long a building permit takes to issue covered 86% (Chicago) and 89% (San Francisco) of 2024 permits when 80% was the target. Last time the explanation was ties: many permits issue the same day, so the conformal scores tie at zero and the interval cannot narrow.

This session tested it. Adding uniform jitter to the integer-day target breaks the ties, and the correction does go negative. But only by 0.08 to 0.26 days, because the 80th percentile of the scores is set by the slower permits. Coverage stayed around 0.87 to 0.90 once the interval was rounded outward. Chicago's over-coverage is drift (the calibration and test score distributions differ, KS 0.25), not ties.

One useful pitfall: unrounded intervals on integer targets can exclude every same-day permit, and coverage fell to 0.34 in San Francisco. Round outward. Where raw intervals under-cover (issue to completion), plain conformal already lifts coverage from 0.77 or 0.79 to about 0.81 to 0.83.

Next is a two-part conformal that models the same-day share directly. Log, code and numbers: `research/build-data/LOG.md`, session 19. Test year 2024 only, three seeds, marginal coverage.
