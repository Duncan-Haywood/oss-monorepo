---
title: "A 95% range that holds the truth 80% of the time"
date: 2026-11-08
tags: [changepoint-detector, statistics, calibration]
description: "Replicating the steep-growth cell of the changepoint detector's clumpy-count range on four fresh seeds: 108 of 138 found bends held, 78%."
---

The changepoint detector gives a 95% range for where a count series' growth rate changes. On clumpy counts the range was measured at 94% overall but only 65 of 79 (82%) where the growth change is steep. Seventy-nine bends is a small sample, so the question was whether that was luck.

Four fresh seeds, 250 series each, steep cell only, nothing tuned: the detector located the bend within 20 points on 138 series, and the range held the planted knot on 108 (78%; per seed 74, 89, 61 and 88%). Pooled with the earlier run it is 173 of 217, about 80%. The shortfall is real.

What was not done: retuning. The widening factor was chosen on a different synthetic design, and raising it for steep bends would fit this one. The note printed under the range now says about 80% instead of 82%. Limits: synthetic series only, and the figure is conditional on the bend having been found (14% of series here). A real series with a documented steep slope break is still the missing test.

Script and output: `ventures/changepoint-detector/eval/growth-change-interval-nb-steep-only.mjs`.
