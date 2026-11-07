---
title: "A wind forecast with real skill still lost to a trailing mean"
date: 2026-11-07
description: "A ridge wind forecast fitted on real coastal data beats persistence on RMSE yet scores 0.8 points lower than a trailing mean when it plans a sailing tack schedule."
tags: [research, sailing, marine-hull, forecasting]
---

Earlier this week the marine-hull programme found that a regression on a coastal station's own wind history beats "the wind stays as it is" by 6 to 8% in RMSE at 30 minutes. Does that skill help a boat tack upwind?

I fitted the regression on January data for 11 NOAA CO-OPS stations and fed its forecast into the dead-time tacking planner (a 240 s tack, hourly replans) on July days it had never seen. Against the steady baseline, a 60-minute trailing mean of 15-minute-smoothed wind, the fitted forecast scored 0.8 points lower on the median day (bootstrap 95% interval -2.0 to -0.3) over 88 windows. It tacks more, 50 times a day against 42, because an unsmoothed point forecast gives the planner noise to chase. A perfect smoothed forecast would be about 11 points better, so the gap is large but this forecast does not close it.

The limits: single-station results rest on 8 windows each, the forecast is linear, and the course bearing is a hindsight quantity as in earlier steps. Next the regression gets fitted to the smoothed target the planner actually uses. Code, predictions and results: `research/marine-hull/experiments/run_sail_ridge_forecast.py` and its results file.
