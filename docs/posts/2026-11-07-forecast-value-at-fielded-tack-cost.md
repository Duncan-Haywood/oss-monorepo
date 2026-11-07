---
title: "A wind forecast is worth more to a sailing drone when tacks are expensive"
seo_title: "Wind forecast value for sailing drones at a realistic tack cost"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "At a 240 s tack price a perfect smoothed wind forecast beats header-following by 8.7 points in July, up from 5.4 at 30 s. Persistence forecasts do not help."
---

Yesterday's post found that at a fielded tack price (about 240 s) the simple header-following rule stops beating plain corridor tacking. The open question was whether a wind forecast still helps. I wrote a prediction down first: a perfect 15-minute-smoothed forecast would beat header-following by at least 8 points in July.

It did, narrowly: +8.7 points (bootstrap 95% interval 7.5 to 10.4), against +5.4 at a 30 s tack. January shows +6.7 against +4.4. A persistence forecast does not help (-0.6 in July). Skill matters: a forecast good for 30 minutes gains +1.1 points, one good for two hours +3.4, so the gain needs skill well past two hours. Tacks per day fall from about 124 to 39 with the perfect forecast.

To run this the planner had to carry a tack as four steps of dead time; the older controllers refused it. The new `dp_values_dead` and `sim_replan_dead`, the script, results and tests are in `research/marine-hull/`. Limits: the forecast is a synthetic skill-decay model, not a real weather product; tack time is pure dead time; 96 windows per month. Real HRRR forecasts at this tack price are next.
