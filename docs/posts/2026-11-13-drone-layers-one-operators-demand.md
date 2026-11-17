---
title: "When the drone layer split goes wrong on paper, one operator's demand is usually to blame"
seo_title: "Drone altitude layers: which operator's demand breaks the split"
date: 2026-11-13
tags: [research, robotics, autonomy, utm, drones, airspace, simulation]
description: "Swapping one operator's census demand for its real destinations fixes the paper layer split in 5 of 6 missed layouts; one pair carries most of the error."
---

Eight drone delivery operators share a city's airspace, and a traffic manager has one spare altitude-layer bit to split them into two groups. In [`aerolog-scaling`](../../research/aerolog-scaling/) I have been building a "paper" weight that picks the split from hub sites, service radii, speeds and census counts of residents and jobs, without any traffic data. It matches the closed form's split in half of 24 random layouts. In six it is more than 5% worse, and two of those (layouts 0 and 17, 21% and 10% worse) have beaten every paper weight I have tried. [Hedging](2026-11-13-drone-layers-near-ties-were-not-the-problem.md) did not help, so the error is a bias.

The same integral run on each operator's real destinations reproduces the closed form, so the bias has to be in the census demand. This step asked where it sits. Before computing anything I wrote down eight predictions and pushed them ([`operator_demand.py`](../../research/aerolog-scaling/experiments/hub_airspace/operator_demand.py)). Then I swapped demand maps one operator at a time: real destinations for one operator and census for the other seven, and the reverse.

## What happened

| layout | census paper split | best single swap to real demand | pair carrying the error |
|---|---|---|---|
| 0 | 1.213 | operator 6: 0.997 | (6, 7): 81% |
| 3 | 1.184 | operator 0: 0.979 | spread over several |
| 5 | 1.077 | operators 1, 2 or 6: 0.995 | (2, 6): 80% |
| 16 | 1.061 | operator 3: 1.030 | spread over several |
| 17 | 1.103 | operator 0 or 2: 1.000 | (0, 4): 100% |
| 19 | 1.087 | operators 0, 2, 5 or 7: 1.000 | (5, 7): 63% |

The numbers are fresh-run conflicts as a ratio to the closed form's split. In 5 of the 6 misses, one operator's real demand is enough to fix the split. In the two stubborn layouts, one pair weight carries most or all of the decision error. The reverse test points the same way: putting one operator's census map back into the real-demand weight breaks its split by more than 2% in 9 of 24 layouts.

## What did not work

I expected the culprit to be the operator whose census map is furthest from its real demand. It is not. Over 191 operators, the error in an operator's pair weights barely correlates with how much its mean leg length differs (Spearman -0.15) or with the total-variation distance between its two maps (0.19). A cheap correction also failed: I rescaled each census map by the operator's true mean leg length, one number every operator knows. The mean stayed at 1.032 against 1.033, with 1 layout better and 3 worse, and layouts 0 and 17 did not move. Four of my eight predictions were wrong.

The error sits in the shape of demand where two service discs overlap. Neither a scalar nor a whole-disc distance sees that. For a planner, the practical reading is to ask operators for their destination distributions rather than keep tuning a census proxy. The 9 layouts that one withheld map breaks are a warning that partial disclosure is not safe in general. Next I will test an overlap-region diagnostic as a predictor of which pair is wrong, and a disclosure order.

Two disclosures. First, the analysis code had a sign error in the error decomposition and a NaN in the per-operator error on its first run; I fixed both and reran before reading the results, and the predictions were not changed. Second, the pair concentration in the table was not predicted. Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts. Preliminary. Full results: [`operator_demand_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/operator_demand_results.txt).
