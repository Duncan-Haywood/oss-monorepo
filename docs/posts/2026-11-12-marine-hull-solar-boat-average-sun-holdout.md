---
title: "A solar boat should set its speed from the average sun, not last week's: the held-out test"
seo_title: "Solar USV speed control: average sun beats recent weather, held out"
date: 2026-11-12
tags: [research, marine-hull]
description: "Tuned on 2015-2019 and tested on 2020-2024, a solar boat that plans speed from day-of-year average sun goes 3.5% further with 44% less payload downtime."
---

Earlier today the marine-hull programme found something odd about a small deck-solar survey boat on a year-long mission. The boat chooses its speed each day. If it plans from the *average* sunlight for that day of the year, rather than from the sun it actually saw last week, it goes further **and** keeps its payload powered more of the time. But that result was found after looking at the data. We tried four variants on the same 300 simulated missions and reported the best, so we couldn't yet tell a real effect from a lucky pick.

This step is the test. Before running anything we fixed a grid of 24 rules: four ways to estimate the day's power (7-day trailing mean, 30-day trailing mean, day-of-year average, or the average scaled by how the last 30 days compared with normal) and six battery-feedback speeds (10 to 90 days). We also fixed a selection rule: pick the variant that goes furthest without more payload downtime than the 7-day rule. Then we tuned on one part of the data and scored on the part the tuning never saw.

- **Across time:** we tuned on 2015 to 2019, building the average from those years alone, as a planner in 2020 would have had to. The rule picked was the day-of-year average with a 20-day battery feedback. On 2020 to 2024 it covered **3.5% more distance with 0.56 times the avoidable payload dark hours** of the 7-day rule, a third of the way to a plan that knows the whole year's weather in advance.
- **Across oceans:** tuning on the Pacific transect and scoring on the Atlantic gave 3.6% more distance at 0.54 times the dark hours. Tuning the other way picked a 30-day feedback: 5.5% more distance, but 1.17 times the dark hours.

All six predictions we wrote down held. At every feedback setting, the average-sun rule beat the trailing-mean rule on distance and on downtime together, so it isn't trading one for the other. Adding recent weather back in, as a capped 30-day anomaly, gained nothing in distance and added 43% to the dark hours. That fits the earlier finding that drag rises steeply with speed, so weather that leaks into the speed is expensive.

For anyone programming a solar USV this is a simple change: set the base speed from a day-of-year sunlight table and let the battery level correct it slowly, over about three weeks. The 20-day setting was chosen on two of the three splits and was the safer pick on the third.

There's a lot this doesn't cover. It's a simulation: calm water, daily steps, NASA POWER sunlight at 30 ocean points, one 4 m boat with a 10 kWh pack and a 30 W payload. The strict-history test uses a single five-year window. The battery target and the speed rule share one climatology, so a trend in sunlight would affect both. Most of the distance gap at high latitudes is still open: the foresight plan goes 1.3 to 1.4 times as far at 50 to 60 degrees. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zo).
