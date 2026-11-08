---
title: "A weather model's trend did not beat 30 minutes of buoy data"
seo_title: "HRRR wind trend nowcast vs persistence for sailing-drone tack planning"
date: 2026-11-05
tags: [research, marine, sailing, forecasts]
description: "Adding archived HRRR's change in wind to the buoy's own recent wind gets a sailing drone to persistence level, not above it."
---

The last step of the marine-hull programme found that archived HRRR winds, raw or bias-corrected, do not beat simply following the wind headers for a replanning wing-sail drone at 10 open-water buoys. A likely reason is that the model's level is off. So this step keeps the buoy's own level (the last 30 minutes) and takes only HRRR's change since the replan time.

Result over 72 January and 80 July windows: the trend nowcast is within 0.2 points of persistence in both months (January +0.2, July -0.2; none of the confidence intervals clears 0.5) and within 0.1 point of the header-follower in January, 0.3 to 0.6 below it in July. Fading the trend with lead gives the same progress with fewer tacks. A 3 km hourly model's trend adds almost nothing to the last half hour of observations.

Caveats: two months, every 4th day, one weight and decay setting each, forecasts with a 3 h assumed latency. A shorter latency is still untested. Log, script and results: `research/marine-hull/LOG.md`, milestone 5l.
