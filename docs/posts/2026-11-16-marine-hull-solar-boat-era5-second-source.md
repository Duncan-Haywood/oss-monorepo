---
title: "A solar boat's high-latitude sun correction, rerun on ERA5: the order holds, half the gain goes"
seo_title: "Solar USV sun correction on ERA5 vs NASA POWER"
date: 2026-11-16
tags: [research, marine-hull]
description: "A solar boat's learned seasonal correction rescored on ERA5 instead of NASA POWER: every ranking holds, but the high-latitude lead shrinks by up to half."
---

For the past two weeks the [marine-hull programme](../../research/marine-hull/) has been asking a practical question. A solar survey boat plans its speed against a sunlight climatology. After one season it has its own energy log. Should it use that log to correct the climatology month by month? The answer we have built up, step by step, is "only at high latitude". At the nine points above about 50 degrees, where the climatology's seasonal error is largest, the learned correction wins far more test cases than no correction at all. Everywhere else it does harm.

All of those numbers came from one sunlight product, NASA POWER's satellite-derived daily shortwave. That is a single point of failure. If the high-latitude advantage were a quirk of how NASA POWER's retrieval handles cloud, the design advice would be wrong. So today we reran the boat on a second source.

## What we ran

[ERA5](https://doi.org/10.1002/qj.3803) is ECMWF's reanalysis. It has a radiation model of its own, constrained by assimilated observations. It is an independent estimate of the same quantity, not a copy of the satellite record. We had already downloaded its daily shortwave for 2005 to 2024 at the nine points (via Open-Meteo, CC BY 4.0) to check one bad year. This time it replaced NASA POWER everywhere the boat touches sunlight at those points: the ten-year climatology it plans with, the year it learns from and the years it is scored on.

Nothing else changed: the same boat, battery sizes, 21 climatology bias shapes, scoring rule and five learning years. A rule "wins" a case when the boat goes at least as far as a plain 7-day trailing-mean rule with no more hours on a flat battery, so the pooled count runs to 168. The nine predictions were [committed before the run](../../research/marine-hull/experiments/run_era5_rules.py), and running the same code on NASA reproduced the published counts exactly.

The first launch printed NASA's numbers twice. A cache had been filled with NASA sunlight before the swap. The run checks for that now, and a test pins it.

## What came out

| Rule | NASA POWER, mean of 168 | ERA5, mean of 168 | Lead over no correction, NASA → ERA5 |
|---|---|---|---|
| No correction | 25 | 29 | — |
| Raw learned month ratios | 81.0 | 57.4 | +56 → +28 |
| Dark-summer guard | 109.2 | 75.6 | +84 → +47 |
| Guard gated on a replay of the logged year | 85.8 | 68.2 | +61 → +39 |
| Fall back to no correction unless the replay is short | 85.0 | 66.8 | +60 → +38 |

Six of the nine predictions held ([results](../../research/marine-hull/experiments/results_era5_rules.txt)).

**The ordering is robust.** Every ranking the paper draft uses survives the change of source. The guard beats the gated rules, the gated rules beat the raw ratios, and the raw ratios beat no correction. The five learning years rank in exactly the same order (Spearman 1.00). The year that collapsed on NASA still does worst on ERA5, though less badly: 16 of 168 against 1.

**The size is not.** Each rule's lead over no correction shrinks by between a third and a half. On the real climatology scored point by point (72 cases), the learned corrections no longer beat no correction at all: the raw ratios average 36.4 against 38. Only the fallback rules hold level. Most of the change comes from three points: the Gulf of Alaska, 60°N in the Pacific and 30°S in the Pacific.

## What it means for a designer

The advice "above about 50 degrees, a learned correction wins more cases" stands as a direction. Its magnitude carries an irradiance-source uncertainty of roughly 18 to 34 of 168 cases. The per-point version of the claim does not survive. ERA5 is not ground truth either. The next tests are a boat that plans on one product and sails on the other, and a ship or buoy pyranometer record at one high-latitude point as a third source.

The code is MIT licensed and stdlib-only, and it reruns in under ten minutes on four cores. It is all in [`research/marine-hull`](../../research/marine-hull/). The log entry is milestone 6zzu.
