---
title: "A buoy's own wind history barely beats persistence"
date: 2026-11-07
description: "On eight NDBC buoys a fitted autoregression gains under 1% over persistence at 10 to 30 minutes and 4% at two hours; a trend rule is worse at every lead."
tags: [research, marine-hull, wind, forecasting]
---

A wing-sail survey drone loses about four minutes every time it tacks, so a good short-range wind forecast would be worth a lot. Last time, archived HRRR forecasts did not pay at that tack price, and the open question was whether anything cheap could supply skill at 15 minutes.

I tested the cheapest candidate: the buoy's own past winds. For eight NDBC buoys with both January and July 2024 data, I fitted a ridge autoregression on January and scored it on July, about 35,500 test rows per lead. Against persistence the pooled skill is -0.5%, +0.3% and +1.0% at 10, 20 and 30 minutes, +2.1% at an hour and +3.8% at two hours. A damped-trend rule is worse than persistence at every lead, by 7% at 10 minutes and 72% at two hours. All of this matched what I wrote down before running.

So 15-minute skill cannot come from one point's time series. It needs upwind sensors or a radar nowcast. The buoys are too far apart for that, so the next step uses coastal station pairs. Limits: linear models only, 10-minute samples, one point per buoy. Code and results are in `research/marine-hull/experiments/run_wind_nowcast_skill.py`.
