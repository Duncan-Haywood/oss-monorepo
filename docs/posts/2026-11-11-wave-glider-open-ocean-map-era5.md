---
title: "How far does a Wave Glider go per day anywhere on the ocean? A map from ERA5 waves"
seo_title: "Wave Glider km/day map from ERA5 wave reanalysis, checked against NOAA buoys"
date: 2026-11-11
tags: [research, marine-hull]
description: "Planned from ERA5 waves, a 2015 Wave Glider at its best makes 50 to 79 km/day over open ocean and never reaches a solar boat's 86 km/day; against buoys ERA5 runs 10% high."
---

This series follows one fielded Wave Glider, a wave-powered surface robot that sailed from Hawaii in 2015. Its speed turned out to follow a simple law: roughly (Hs/T)^0.53, wave height over wave period, which is close to how fast the float is pushed up and down. The last milestone found that ERA5, the ECMWF wave reanalysis on a 0.5 degree grid, reproduces that law along the vehicle's own track as well as the vehicle's wave sensor did. That suggested one could plan a Wave Glider's distance per day anywhere ERA5 covers, which is the whole ocean.

This milestone tested that claim and then used it. We wrote nine predictions down before fetching any data.

**First, the check at buoys.** At eleven NOAA buoys around the US, January and July 2024, an earlier milestone planned km/day from each buoy's measured waves. Putting ERA5 at each buoy's grid point in place of the buoy:

- ERA5 plans **about 10% more** distance than the buoy does (median ratio 1.10; 75% of buoy-months within 15%). We had predicted within 10%, and missed by a hair.
- **In July it ranks the sites correctly** (rank correlation 0.93), and gets the summer spread between the fastest and slowest buoy (1.64 against 1.73).
- **In January it does not** (rank correlation -0.12). In winter every buoy plans within 12% of the others, and ERA5's error is about that size, so the ranking is noise.

After seeing this we looked for the cause, so this part is exploratory. The site-to-site error is almost all calibration: the ratio predicted from how ERA5's wave height and mean period compare with each buoy's correlates 0.99 with the actual error. The main term is period. ERA5's mean period runs 1.20 times the buoys' average period, but 1.29 times the vehicle's own, and the ratio changes with the kind of sea. A wave model can tell a planner which season and which ocean. It cannot pick between two nearby winter sites unless its period is calibrated for that site.

**Then the map.** On a 10 degree grid from 70 S to 70 N, at the 2015 vehicle's best month:

- **50 to 79 km/day** covers the 10th to 90th percentile of ocean points (median 63 in January, 61 in July).
- **The winter storm belts are fastest**: band medians of 75 km/day near 40 to 70 N in January and 77 near 40 to 70 S in July. The long-swell tropics are slowest, at 56 to 57, because long, gentle swell has a low height-over-period.
- **No point reaches 86 km/day**, the ceiling we found earlier for a boat running on deck solar panels. The best cells reach 85.6. At the vehicle's worst month every figure is 40% lower.
- **A third of ocean hours (33%) lie outside the seas the law was fitted on**, mostly the tropics' long swell and the winter storm belts.

What a planner can take from this: a Wave Glider's case against a solar boat is endurance, weather and payload power, not distance per day. If you plan with a wave model, expect it to run about a tenth optimistic. Calibrate its period against a local buoy where one exists before trusting a site ranking.

The limits are real. One vehicle and one mission set both the law and the vehicle's "best month". ERA5 is a reanalysis, which is better than any forecast. The grid takes the nearest 0.5 degree cell to each 10 degree point. We looked only at January and July 2024.

The code, data, pre-registered predictions and results are in `research/marine-hull/` (milestone 6x, `experiments/run_waveglider_era5_sites.py`). ERA5 data: Copernicus Climate Change Service, via Open-Meteo (CC BY 4.0).

*Written with AI assistance (Claude Code).*
