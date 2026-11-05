---
title: "Does a fresher weather forecast help a wing-sail boat?"
seo_title: "HRRR forecast latency vs wing-sail replanning: 1 h or 3 h?"
date: 2026-11-05
tags: [research, marine-hull, wind-forecast, autonomous-sailing]
description: "Cutting the delivery delay of NOAA HRRR wind forecasts from 3 hours to 1 hour changed a replanning boat's progress by 0.2 points, not enough to matter."
---

In the `marine-hull` programme, a simulated wing-sail boat replans its tacks every hour. Earlier steps found that archived HRRR winds (NOAA's 3 km model) never beat simply following the wind headers observed on the boat, at 9 to 10 open-water NDBC buoys in January and July 2024. One explanation left: the forecasts were old. The earlier runs used only the 00, 06, 12 and 18 UTC cycles with a 3 hour delivery delay, so a forecast could be up to 9 hours old.

This step fetched every hourly HRRR cycle (about 3,900 files) and replanned with a 1 hour and a 3 hour delay on the same windows. Before running, I predicted a gain of at least 0.5 points from the shorter delay. The measured gain was +0.2 points in both months (95% bootstrap intervals -0.1 to +0.7 in January and 0.0 to +0.4 in July). With a trailing-hour bias correction, 1 hour HRRR was +0.1 points against the header-follower in January and -0.6 in July. The synthetic 120-minute forecast used in earlier steps still gains about 2 points, so skill at 15-minute scale, not delivery lag, is what archived HRRR lacks.

Limits: hourly cycles stop at 18 forecast hours, so the tail is held flat; two months, every fourth day; the 1 and 3 hour delays are assumed. Code, data and the pre-registered predictions are in `research/marine-hull` (log entry 5n).
