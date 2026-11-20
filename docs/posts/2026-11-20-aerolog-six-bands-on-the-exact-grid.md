---
title: "Drone altitude layers on a grid with every band count: six bands win more often than we reported"
seo_title: "Drone altitude layers: the missing six-band spacing, rerun"
date: 2026-11-20
tags: [research, uav, airspace, optimisation, reproducibility]
description: "Rerunning the drone layer planner with the missing 6-band spacing: the median plan stands, but ignoring barometer offsets costs more than we said."
---

`aerolog-scaling` plans how delivery-drone operators sharing a city are
stacked into altitude layers under the 400 ft (120 m) ceiling. The last step
(11au) found a bug in our own setup. The list of layer spacings the planner
picks from was built by rounding 120 m / (2k − 1) to six decimals. For six
bands (10.909091 m) and eleven bands (5.714286 m) the rounding landed a hair
above the exact value, so those spacings fitted one band fewer. Every result
since milestone 11ah had been chosen from a list with no 6-band option.

11au had made the planner about 150 times faster, so this step (11av) simply
reran it with the two exact spacings added. The predictions were committed
before the run, and the whole rerun took about two minutes on four cores. The
original took 95.

## What stays the same

With the two spacings added, the rerun reproduces the old plans exactly. The
band count matched in 96 of 96 draws in every cell. With each operator's
measured barometer offset known, the median plan is still **5 bands at
13.3 m**, and at twice the offset it is still **3 bands at 24 m**.

## What changes

| | 6 bands chosen (of 96 draws) | largest saving |
|---|---|---|
| 12 operators, measured offset | 17 | |
| 16 operators, measured offset | 31 | 8.6% |
| 12 operators, twice the offset | 14 | |
| 16 operators, twice the offset | 26 | |

With no offsets at all, 6 bands win in 26 of 48 city layouts, and for 16
operators the median spacing becomes 10.9 m.

The number that moved most is the price of ignoring the offsets. A planner
that does not know them is now offered the thinner 6-band stack and often
takes it. Under the real offsets that thin stack leaks more:

| blind plan / offset-aware plan (median) | old grid | corrected grid |
|---|---|---|
| 12 operators, measured offset | 1.034 | **1.044** |
| 16 operators, measured offset | 1.018 | **1.065** |
| 12 operators, twice the offset | 1.163 | **1.205** |
| 16 operators, twice the offset | 1.130 | **1.218** |

That was the one prediction that failed. We expected the ratio to move by at
most 0.01. It moved by up to 0.047. Five of six predictions held. So the
paper's advice to measure each operator's offset before stacking them gets
stronger, but the numbers behind it in sections 6.5 to 6.10 needed
correcting. Section 6.12 of the draft paper now carries the correction.

## Caveats

One city (New York), one demand year, a conflict model without avoidance,
and 5 flight logs for the offsets. Only the widest spacing is tried for each
new band count. The rule comparisons of 11ap and 11ar to 11at have not been
rerun on the corrected grid yet. That is next, and it now takes minutes.
All results are preliminary.

Results: [`exact_grid_results.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/aerolog-scaling/experiments/hub_airspace/exact_grid_results.txt);
code: [`exact_grid.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/aerolog-scaling/experiments/hub_airspace/exact_grid.py);
project page: [aerolog-scaling](https://marisstella.app/research/aerolog-scaling/).
