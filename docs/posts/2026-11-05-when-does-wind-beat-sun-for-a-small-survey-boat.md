---
title: "When does wind beat sun for a small autonomous survey boat?"
seo_title: "Wing-sail drone vs solar boat: kilometres per day on real buoy wind"
date: 2026-11-05
tags: [research, marine-hull, wing-sail, solar, usv]
description: "On 19 buoy-months of NDBC wind, a modelled 5 m wing-sail drone covers a median 219 to 272 km/day on a free course; a solar boat at 1 m/s tops out at 86."
---

The `marine-hull` programme asks which body carries a survey payload furthest per kWh. After a long run of wing-sail forecast tests that ended in negative results (archived HRRR winds never beat simply following the headers), the next question was the plain one: when does wind beat sun?

The drone model is the programme's default 5 m wing-sail craft, with every parameter swept elsewhere and none taken from a vendor. I ran it on a free course (no survey line, no upwind mark) over the 10-minute winds of 9 NDBC buoys in January 2024 and 10 in July 2024. It reaches 1 m/s once the wind passes 1.5 m/s. The median distance is 272 km/day in January and 219 km/day in July. The solar boat's comparator is its 1 m/s best-range speed held for a full day, 86 km/day, which is a ceiling because the real boat is also energy-limited.

Only calm summer water makes the sun competitive: buoy 42036 in the Gulf of Mexico in July (mean wind 2.6 m/s) clears 86 km/day on 83% of days; every other buoy-month clears it on at least 94%.

This is a bound, not a forecast. The drone's speed is capped at a Froude number of 0.5 (3.5 m/s) and buoy anemometers sit below sail height, while heel, waves, leeway, gusts and a course that has to follow survey lines are all missing. I have not checked the figure against a fielded wind-driven vehicle's logged distance, which is the next step.

Code, data and the full table: `research/marine-hull/experiments/run_wind_vs_sun.py` and `results_wind_vs_sun.txt`; the log entry is milestone 6h.
