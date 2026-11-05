---
title: "A real weather forecast did not help a sailing drone replan"
seo_title: "HRRR forecast vs header-following for an autonomous sailboat: real data"
date: 2026-11-05
tags: [research, marine, sailing, forecasts]
description: "Replacing a synthetic forecast with archived HRRR winds at 12 US stations: raw model winds lose to simply following wind shifts."
---

Earlier steps of the marine-hull programme found that a wing-sail drone replanning its tacks hourly gains about 3 points of progress over a plain "follow the headers" rule, but only if its forecast is skilled at 15-minute scale. That used a synthetic forecast error. This step swaps in archived HRRR 10 m winds (NOAA open-data bucket) at 12 CO-OPS stations, 8 days in each of January and July 2024, 96 windows per month.

Result: raw HRRR is 2.9 (Jan) and 6.5 (Jul) points below the header-follower and below persistence, with 466 to 513 tacks a day. A trailing-hour speed and direction correction recovers about 2 points but not more. HRRR's mean absolute direction error against the stations is 32 to 41 degrees and does not grow with lead, so this is mostly a siting mismatch (a 3 km cell against a pier anemometer), not forecast decay. It says nothing yet about open water.

Caveats: station coordinates were recalled, not looked up; a 3 h delivery latency was assumed. Full log, data and script: `research/marine-hull/LOG.md`, milestone 5h.
