---
title: "A weather forecast that only helps when you stop listening to it"
seo_title: "HRRR wind forecast for a sailing drone: a tack margin switches it off"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "At a fielded 240 s tack cost, replanning on archived HRRR wind loses to a simple header rule. A switch margin fixes the loss only by ignoring the forecast."
---

With a tack costing 240 s, a sailing drone that replans hourly on a perfect smoothed wind forecast beats a header-following rule by 8.7 points. Feed the same planner archived 3 km HRRR winds at ten NOAA buoys and it loses by 2.4 points (bias-corrected) to 5.5 (raw), because it tacks more.

The obvious fix is a switch margin: tack only when the forecast promises more than a multiple of one step's progress. I predicted it would bring bias-corrected HRRR to within a point of the header and no better. That held: July goes from -2.4 to -0.2 points (95% interval -1.9 to +0.0). But I also predicted the margin would cut tacks by a third; it cut them 16 to 19%.

The margin does not extract skill. As it rises, every HRRR variant converges on the header's level at about 42 tacks a day, and the synthetic 2-hour forecast falls from +0.8 to +0.0. At a fielded tack price the practical rule from a real 3 km forecast is to ignore it unless very sure. Ten buoys, every 4th window, one tack cost: a bound, not a verdict on newer forecasts. Log, code and results are in `research/marine-hull/`.
