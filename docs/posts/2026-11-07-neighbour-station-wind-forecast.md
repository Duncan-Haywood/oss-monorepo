---
title: "Does a second weather station 15 km away help predict a sailing drone's wind?"
seo_title: "Wind forecast skill from a neighbouring coastal station: under 1 point"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "On NOAA CO-OPS 6-minute wind data, adding a station 15 to 70 km away improves a 30-minute wind forecast by under 1 point over using the target's own history."
---

Replanning a sailing drone's route only pays if the wind forecast beats "it stays as it is" (persistence) at the 15 to 30 minute scale. Earlier runs showed an archived HRRR forecast does not, and that a buoy's own history adds almost nothing. The open question was whether a neighbouring station helps.

I tested two pairs from NOAA CO-OPS 6-minute data: San Francisco and Alameda (about 15 km) and Pensacola and Dauphin Island (about 70 km), with a ridge regression on six lags of both stations. At 30 minutes the neighbour adds +0.6 to +0.9 points of RMSE skill over the target's own history. Even at two hours it adds at most 4.7 points.

Two of my three predictions failed. The target's own history is worth 5 to 8% at some stations (San Francisco +7.6% at 30 minutes), more than the buoys earlier suggested, and the neighbour adds less than I guessed (I put 40% on at least 5 points). Both pairs sit in bays or sounds, so this does not rule out an offshore upwind sensor or radar. Code, data and results are in `research/marine-hull/experiments/` (`run_wind_pair_skill.py`).
