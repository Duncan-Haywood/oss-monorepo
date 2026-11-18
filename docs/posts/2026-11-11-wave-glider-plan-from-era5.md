---
title: "A wave model can stand in for a Wave Glider's own wave sensor, for planning"
seo_title: "Planning Wave Glider km/day from ERA5 instead of on-board waves"
date: 2026-11-11
tags: [research, marine-hull]
description: "ERA5 waves at a 2015 Wave Glider's position give the same speed law (0.533 vs 0.534) and monthly km/day as its own sensor, but little day-ahead skill."
---

The last two posts found that a fielded Wave Glider's speed follows its own measured heave velocity: speed goes roughly as (Hs/T)^0.53, wave height over wave period. That law came from a wave sensor bolted to the vehicle. Someone planning a mission doesn't have that record. Away from a buoy they have a wave model and nothing else.

So we swapped the sensor for a model. ERA5 is ECMWF's global reanalysis (Hersbach et al. 2020). It has hourly significant wave height and mean wave period on a half-degree grid, and Open-Meteo serves it without an account. We read it at the grid point nearest the vehicle for every hour of the 2015 Honey Badger mission, all 3,657 hours. We wrote six predictions down before the run. Two held.

What we found:

- **The model tracks the sensor far better than we expected.** Within a month, log(Hs/T) from ERA5 correlates **0.87** with the on-board value. We had predicted 0.5 to 0.85. A buoy 100 to 300 km away managed 0.20. ERA5's wave height runs at 0.96 of the sensor's. Its mean period is 1.29 times the sensor's average period, which is expected, because the two use different definitions.
- **The speed law doesn't change.** Fitted on ERA5, the exponent is **0.533** (95% 0.45 to 0.62). On board it is 0.534, on the same hours. We had predicted the noisier input would flatten it to 0.25 to 0.50. It didn't. One caveat: use ERA5's mean period. With its peak period the exponent drops to 0.33.
- **The monthly plan doesn't change either.** km/day planned from ERA5 lands within 0.4 km/day of the on-board plan in every month, from 50 in June to 35 in October.
- **As a forecast it adds little.** Take a forecast that carries the vehicle's recent speed forward and scale it by the change in sea state. ERA5 cuts the error by about 4% a day ahead, which is not significant, and by 15% at three days. A perfect on-board sea state, used the same way, cuts it by 12% and 23%. Six hours ahead, neither helps.

For a planner, the upshot is that you can work out a Wave Glider's km/day for a site from ERA5 alone, buoy or no buoy, so long as you use the mean period. For steering a mission day by day, sea state is a small correction to the vehicle's own logged speed.

Two caveats. First, ERA5 is a reanalysis, built after the fact from observations, so it carries no forecast-lead error. A real three-day forecast will do worse, and these numbers are an upper bound. Second, this is one vehicle in open Hawaiian and North Pacific seas, where a half-degree model does well. Coastal and calm-sea sites are untested. The next steps are to plan from ERA5 at the 2024 buoy sites, to check it against the buoy-based plan, and to find a vehicle fielded after 2017, when archived WAVEWATCH III forecasts exist.

The code, data, pre-registered predictions and results are in `research/marine-hull/` (milestone 6w, `experiments/run_waveglider_era5.py`). ERA5 data: contains modified Copernicus Climate Change Service information, via Open-Meteo (CC BY 4.0).

*Written with AI assistance (Claude Code).*
