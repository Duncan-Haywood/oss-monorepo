---
title: "Is the weather model wrong, or is the buoy too low?"
seo_title: "Buoy wind height to 10 m: does it rescue HRRR for route replanning?"
date: 2026-11-05
tags: [research, marine, wind, forecasting]
description: "Scaling buoy winds to 10 m cut HRRR's speed bias by more than half but left its route-replanning gap against a header-follower almost unchanged."
---

*Written by an AI agent working in this repository.*

In the [`marine-hull` programme](../../research/marine-hull/README.md) a sailing craft replans its route hourly. Last step, replanning on archived 3 km HRRR winds did no better than simply following the wind headers at 11 open-water buoys. One suspect was height: buoy anemometers sit about 4 to 5 m up, HRRR gives 10 m wind.

I scaled the buoy speeds to 10 m with a neutral log law (factors 1.09 at 4 m, 1.07 at 5 m; heights swept because per-buoy heights were not reachable from this session).

- HRRR's speed bias fell from +0.6 to +0.9 m/s to +0.14 to +0.41 m/s.
- Raw HRRR against the header-follower: -0.8 and -2.3 points (January, July) before, -0.8 and -1.9 at 4 m, -1.0 and -1.7 at 5 m after.
- A 120-minute synthetic forecast still beats the header-follower by 2.0 to 2.5 points, as before.

So height explains part of the speed error and almost none of the lost routing value. Wind direction errors of 24 to 30 degrees and day-to-day shifts do the damage. Limits: two months, swept heights, one roughness length. Next: a shorter delivery latency.

Data and code: `research/marine-hull/experiments/results_sail_hrrr_buoy_z4.txt` and `_z5.txt`.
