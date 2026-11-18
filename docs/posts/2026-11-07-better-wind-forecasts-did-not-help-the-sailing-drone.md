---
title: "A better wind forecast did not help the sailing drone tack"
date: 2026-11-07
description: "Coastal wind forecasts with 4 to 8% less error than persistence still did not beat a trailing-mean wind for tack planning at a 240 s tack cost."
tags: [research, marine-hull, sailing, forecasting]
---

A wing-sail survey drone loses about 240 s to each tack, so knowing the wind ahead should pay. A perfect 15-minute-smoothed forecast is worth about +11 points of progress over a trailing 60-minute mean. We tried to buy part of that with real data.

A buoy's own history adds under 4% over persistence at 10 to 120 min. At coastal stations a fitted ridge forecast did reach 4 to 8% lower vector error (San Francisco +0.076 at 30 min). A neighbour 15 to 70 km away added under 1 point. Run through the tack planner, though, the ridge forecast scored 0.8 points worse than the trailing mean (95% interval -2.0 to -0.3). Fitting it to smoothed wind and shrinking it toward the mean only converged on the trailing mean (-0.3, interval -1.0 to +0.3).

So error skill is not tack value: a point forecast raises the tack count (50 against 42 per day) and each tack is expensive. The remaining input is offshore upwind sensing or radar, which we do not have data for. Limits: 11 coastal stations, 88 July windows, linear models, hindsight mark bearing. Details are in `research/marine-hull/LOG.md` and paper section 2.5.1.
