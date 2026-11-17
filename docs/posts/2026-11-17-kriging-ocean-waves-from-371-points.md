---
title: "Filling in a map from 371 points: kriging ocean waves, and why inverse distance lost to the nearest point"
seo_title: "Free kriging tool online: variogram, kriged map and standard errors"
date: 2026-11-17
tags: [kriging, geostatistics, variogram, spatial-interpolation, research-algorithms]
description: "A free browser kriging tool maps scattered readings with standard errors. On ERA5 wave heights it misses by 0.39 m; inverse distance by 0.62 m."
---

You have readings at some places (soil samples, wells, rain gauges, a grid
of ocean cells) and need the values in between. The two usual answers are
inverse distance weighting, which averages the readings with weights of
1/distance², and kriging, which picks the weights from the data's own
**variogram**: how fast two readings stop resembling each other as the
distance between them grows. Kriging also gives a standard error at every
place. Inverse distance gives none.

The new [kriging interpolation tool](https://marisstella.app/kriging-interpolation/)
does the whole job in the browser. It bins every pair of readings by
distance (Matheron 1963, or the robust Cressie & Hawkins 1980 form), fits a
spherical, exponential or Gaussian model by Cressie's (1985) weighted least
squares, and draws the kriged map and the standard-error map. Then it
checks itself. Each reading is left out in turn and predicted from the
rest. That is cheap: Dubrule (1983) showed all *n* leave-one-out errors
come from one inverse of the kriging matrix. Inverse distance and the
nearest reading are scored the same way, and the tool says in words which
one won.

## Real data: a month of ocean waves

The example is real. It is the median significant wave height in January
2024 at 371 ocean points on a 10° grid, from the ERA5 reanalysis (Hersbach
et al. 2020, CC BY 4.0). A research programme in this repository had
already fetched it for planning a wave-powered vehicle. Each reading
predicted from the other 370:

| Method | RMSE (m) |
| --- | --- |
| Kriging, exponential variogram | 0.390 |
| Nearest point | 0.505 |
| Inverse distance, power 2 | 0.623 |
| Mean of the others | 0.902 |

Inverse distance does worse than simply copying the nearest point. Over the
whole globe every far cell still gets a little weight, and 370 small weights
add up. The cell at 40°N 40°W, in the North Atlantic storm track, had
4.06 m. Inverse distance predicts 2.89 m for it from the rest, pulled
towards the calm tropics; kriging predicts 3.69 m. Kriging's weights come from a variogram that says readings
1,000 km apart share about 78% of their variation, so it leans on near
neighbours and mostly ignores the rest.

The fitted variogram's practical range is 15,100 km, longer than any
straight-line distance through the Earth (12,742 km). The data never level
off, because the contrast between the Southern Ocean and the tropics runs
across the whole planet. The tool warns that the sill is then a guess.

Distances use the chord through the Earth rather than the great circle.
A covariance that is valid in three dimensions stays valid on the sphere
when measured that way (Gneiting 2013), and the great-circle distance does
not keep the Gaussian model valid. The chord also makes 179°E and 179°W
neighbours with no special case.

The biggest misses are the interesting part. A point at 60°N 10°E, sheltered
water in southern Norway, had 0.22 m where its open-ocean neighbours imply
2.2 m. Coastal points in the Gulf of St Lawrence and the Gulf of Alaska
miss the same way. A variogram that ignores direction and coastlines treats
a fjord like open sea. The tool lists every point more than 3 standard
errors out, which is where a reader should look first.

## Does the standard error mean anything?

The leave-one-out check gives one number for that: the mean of
(error / standard error)², which should be near 1. On the wave data it is
0.65, so the bands are too wide, not too narrow. That is the safe direction
to be wrong in, but still wrong.

To test the bands against a known truth, `eval/simulate.mjs` draws 40
random fields with a known covariance. It gives the tool 150 readings of
each field and scores it at 100 sites it never saw. The 95% bands covered
95.1% of those 4,000 held-out values. The leave-one-out number averaged
1.00, and the fitted range landed within a median 4% of the true one.
Kriging's held-out RMSE (0.632) beat inverse distance (0.696) on 36 of the
40 fields and the nearest reading (0.792) on all 40. Those fields are
built to suit kriging, so the four losses are the more telling result.
Even on its home ground kriging does not always win, which is why the tool
runs the comparison on your data, not on ours.

The engine was also checked against two independent routes. One is the
covariance-form predictor solved with a separate Cholesky routine (equal to
1e-8). The other is an exact textbook result: in one dimension with a
linear variogram, kriging must reduce to straight-line interpolation with a
Brownian-bridge variance, and it does, to 1e-9.

## What it does not do

The variogram is the same in every direction, the mean is constant (no
trend surface), and every reading enters every estimate, so the tool takes
up to 1,000 locations. Anisotropy is the obvious next step. The fjord
misses above are what a direction-aware or coast-aware model would fix.
Universal kriging with a linear trend comes after that. The map is a
statistical estimate, not a survey or a site assessment.

The tool is free and MIT licensed, and nothing is uploaded. It also runs from the command line
(`node cli.mjs readings.csv --predict 10:20 --csv`) and as an agent call.
Source: [`ventures/kriging-interpolation`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/kriging-interpolation).
