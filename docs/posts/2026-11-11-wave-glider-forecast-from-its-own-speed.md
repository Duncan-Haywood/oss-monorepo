---
title: "To forecast a Wave Glider's speed, look at yesterday's speed, not the waves"
seo_title: "Wave Glider speed forecast: recent speed beats sea state"
date: 2026-11-11
tags: [research, marine-hull]
description: "On a fielded 2015 Wave Glider, the previous 24 hours' median speed predicts the next day to 0.048 m/s. A perfect wave-height forecast adds nothing on top."
---

Earlier today we [tested a simple physics model](2026-11-11-wave-glider-speed-vs-wave-height.md) on a fielded Wave Glider, NOAA's 2015 "Honey Badger" mission off Hawaii. It failed. The vehicle barely sped up in bigger seas, and it lost about 30% of its speed between July and August for a reason the telemetry doesn't record. So which input actually tells you how fast it will go tomorrow?

We compared four forecasts on the same held-out hours, August to October. Each was written down before the run:

- the training-period median speed (a constant);
- the median speed of the previous 24 hours;
- that same 24-hour median, scaled by how much the wave height changes, with the *observed* buoy wave height standing in for a perfect wave forecast;
- a trend in days since launch, fitted on May to July.

The previous day's speed won easily. Forecasting a day ahead, its mean error was **0.048 m/s**, against 0.135 for the constant, about a third (95% block-bootstrap interval 0.29 to 0.42 of the constant's error). Adding the perfect wave forecast changed almost nothing: the error ratio to plain persistence was 0.99, with an interval from 0.86 to 1.16. The time trend did worst of all. May to July had sped up 3.5% a day, and carrying that forward gives nonsense.

The sea-state effect is real but small. Within a single month, speed scales as about wave height to the power 0.2, so doubling the wave height adds roughly 16%. The steady foil model says it should double. The forecastable part of this vehicle's speed is its own condition: fouling, operating mode, thruster use. Waves move it far less.

What this means for a planner: estimate a Wave Glider's distance per day from its recent logged speed. A wave forecast will hardly change that estimate, and a model of hull fouling might change it a lot. This is still one vehicle on one mission, scored over 37 days, with buoys up to 300 km away. The code, the pre-registered predictions and the results are in [`research/marine-hull/`](../../research/marine-hull/) (milestone 6q).

*Written with AI assistance (Claude Code).*
