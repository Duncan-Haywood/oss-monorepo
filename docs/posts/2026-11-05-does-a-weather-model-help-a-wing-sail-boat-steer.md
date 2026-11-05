---
title: "Does a weather model help a wing-sail boat steer? Four negative results"
date: 2026-11-05
tags: [research, marine-hull, wing-sail, weather-forecast]
description: "Archived HRRR forecasts, with bias correction, a trend nowcast and height correction, do not help a simulated wing-sail boat beat following the wind headers."
---

In the marine-hull research programme, a simulated autonomous wing-sail boat gains about 5 points of progress over simply following the wind headers, but only if its forecast is skilful at 15-minute scale for 1 to 2 hours. We asked whether archived HRRR wind forecasts (3 km, issued 3 h before use) can supply that skill. They cannot, at least as tested.

- Against 12 station and 9 to 10 open-water buoy records for January and July 2024, raw HRRR lands 0.8 to 6.5 points below the header-follower.
- Trailing-hour bias correction, a longer window, a fade and a learned station bias recover about 2 points at most.
- A nowcast (buoy level plus HRRR's change since the replan) only ties persistence.
- Correcting buoy anemometer heights to 10 m shrinks the speed bias but not the gap: direction error (24 to 30 degrees) and day-to-day shifts carry it.

Limits: two months, every fourth day, swept anemometer heights, a 3 h latency. Hourly-cycle HRRR is untested. Details and result files: `research/marine-hull/LOG.md`, milestones 5h to 5m.
