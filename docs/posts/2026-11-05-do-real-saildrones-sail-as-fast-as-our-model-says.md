---
title: "Do real Saildrones sail as fast as our model says?"
seo_title: "Saildrone daily distance: 864 fielded days vs a wing-sail model"
date: 2026-11-05
tags: [research, marine-hull, saildrone, sailing-drone]
description: "NOAA's Saildrone surveys give a median 75 km/day. Our wing-sail model, given the same wind and course, says 2.5 times that, erasing its edge over a solar boat."
---

The `marine-hull` programme had a model of a 5 m wing-sail drone that, on buoy winds, covered 2 to 3 times the daily distance of a solar boat. Its only check was one press-release figure. This run used 864 drone-days from 13 Saildrones on NOAA's 2018 and 2019 west-coast surveys (public data, each drone's own wind and track).

- Observed median: 75 km/day at a median 4.7 m/s of wind. The model, sailing the same wind and the course the drone actually sailed, predicts 2.5 times that (observed/model median 0.40).
- It is not only mission behaviour: at 4 to 12 m/s the best 1% of 10-minute blocks reach only 0.68 to 0.82 of the model speed.
- Scaled by the fielded factor (0.33 against a free beam reach), the buoy-wind distances fall to 79 km/day in January and 60 in July, against an 86 km/day solar ceiling. The old wind-over-sun margin is gone and the ranking is open.

Caveats: these are survey missions (turns, station keeping), the drones are 7 m Explorers while the model is 5 m with unsourced parameters, and one scalar factor hides a range of 0.28 to 0.60 by wind. Next is fitting the model to the block-level speed curve and re-running the comparison. See `research/marine-hull/LOG.md` (milestone 6l).
