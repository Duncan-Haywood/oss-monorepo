---
title: "Drone altitude layers: one leak budget in every fold, and three spacings around it"
seo_title: "Drone altitude layer spacing: a cross-validated leak budget"
date: 2026-11-21
tags: [research, uav, airspace, optimisation]
description: "Cross-validated on conflict cost, the altitude-layer leak budget is 0.05 in all 48 folds; searching three spacings around it matches the full search's median."
---

Earlier today [`aerolog-scaling`](../../research/aerolog-scaling/) replaced
the 3-sigma rule for spacing delivery-drone altitude layers with a *leak
budget*. The rule averages the chance that two drones one level apart lose
vertical separation, weighted by how often their routes conflict, and picks
the most layers whose average stays under the budget p. That run set p by
matching the band count the full planner picks, on one split (12 operators to
16), and got p = 0.07.

Matching the band count was the weak part. At twice the measured barometer
offset the full planner splits between 3 wide bands and 5 or 6 thin ones, so
no budget matched more than 54 of 96 draws. What a planner actually pays is
the conflict cost of the finished plan. So this run picked the budget that
minimises that cost and cross-validated it, leaving out one of the 48
operator layouts at a time. The predictions were pushed before the script
ran.

## What came out

- **The budget is the same in every fold: 0.05** (48 of 48). It does not
  depend on which layout is held out or on the 12-to-16 split.
- With 50 random restarts at the budget's one spacing, the held-out plan
  costs a median **1.0016 to 1.0122** times the full search over 32 spacings.
- Searching the budget's band count **and its two neighbours** (150 local
  descents instead of 1,600) brings the median to **1.0000 to 1.0020**. It
  lands within 1% of the full search in 69 to 83 of 96 draws per cell,
  against 44 to 56 for one spacing.
- **The tail stays.** At twice the offset the three-spacing rule's 90th
  percentile is 1.068 (12 operators) and 1.052 (16). The worst draw still
  costs 1.55 times the full search, because there the right band count is two
  or more away from the budget's. Both tail predictions were refuted, so
  three of five held.

The whole analysis reuses the earlier run's saved per-draw leaks and costs
and takes two seconds. Nothing was re-searched, so this checks how the budget
is chosen, not the random search itself.

## What a planner can take from it

Fix the budget once at about 5% per adjacent pair and use it as the centre of
a small search, not as the answer. If the offsets are large (faster cruise,
mixed airframes), keep the full search over spacings: the cheap rule's median
is fine, but its tail is not.

Results, code and the paper section (6.15):
[`budget_cv_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/budget_cv_results.txt),
[`budget_cv.py`](../../research/aerolog-scaling/experiments/hub_airspace/budget_cv.py),
[`paper/airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md).
These are preliminary: 48 synthetic layouts in one city, offsets from 5
uploaded flights, offsets known exactly to every rule.
