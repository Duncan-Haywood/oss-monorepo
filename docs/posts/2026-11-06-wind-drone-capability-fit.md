---
title: "A two-parameter sail-drone model fits the average, not the best"
seo_title: "Sail drone speed model fitted to Saildrone capability"
date: 2026-11-06
tags: [marine-hull, saildrone, sailing-drone]
description: "A two-parameter sail-drone model matches mean Saildrone speed but not its 90th-percentile capability; capability is about 1.3 times the survey average."
---

The marine-hull programme asks which small ocean craft carries a survey payload furthest. Yesterday's step fitted a sail-drone model to 131,535 ten-minute blocks of public NOAA Saildrone tracks and got the average daily distance right (model over observed 0.89 on a held-out year).

Today's step asked whether the same two parameters, sail area and hull drag, can be tuned to the drone's *capability*, the 90th-percentile speed in each wind and wind-angle cell, rather than its survey-mission average. They can't. The best fit (0.45 m2 of sail, hull drag 0.6) leaves 25% of the training blocks and 31% of next year's blocks above the curve, where a true 90th-percentile curve would leave 10%. Below 4 m/s of wind, 46% of blocks sit above it, because current and drift, not wind, set the speed there.

What survives is a ratio: capability is about 1.3 times the mission-average speed. Applied to the earlier result, that caps how much a transit-mode drone could gain over a solar boat. The fit and its limits are in `research/marine-hull/LOG.md` (milestone 6n), and the script is `experiments/run_saildrone_cap.py`.
