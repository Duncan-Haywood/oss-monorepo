---
title: "How many drone altitude bands fit under 400 ft, and what layer spacing costs in conflicts"
seo_title: "Drone altitude bands under the 400 ft ceiling: layer spacing cost"
date: 2026-11-17
tags: [research, uav, airspace, operations-research]
description: "With 25 ft between layers, 8 drone altitude bands fit under 400 ft and leave a sixth of the conflict weight; 50 ft spacing leaves half as much again."
---

`aerolog-scaling` asks how drone delivery operators that share a city should be
split into altitude layers. The last two steps (11af and 11ag) charged each
layer for the climbs and descents through it. A drone cruising in a high band
climbs through every band below it at its hub, and descends through them again
at the customer's address. Under that charge, the best plan still used 10 of
12 or 13 of 16 possible bands. Nothing limited how tall the stack could get.

**This step (11ah) adds the ceiling.** For small drones in the US, 14 CFR
107.51(b) says the aircraft "cannot be higher than 400 feet above ground
level" (outside a structure exception this model does not use). How many bands
fit then depends on two numbers a regulator would set:

- the vertical spacing h between layer levels. Each band uses two levels, one
  for eastbound and one for westbound flights.
- the usable depth H between the lowest and highest level.

The spacing also sets how long a drone spends crossing each level. Taking the
DJI Matrice 300 RTK's P-mode limits (5 m/s up, 4 m/s down), a 25 ft (7.62 m)
spacing means 1.7 s per level crossed. That spacing is the one used in Doole,
Ellerbroek and Hoekstra's layered urban airspace studies.

The other inputs are the earlier steps' 48 operator layouts, built on New York
destination data. Five predictions were committed before any capped plan was
searched.

## What came out

Median share of the single-band conflict weight left by the best plan:

| usable depth | 25 ft levels | 50 ft levels | 100 ft levels |
|---|---|---|---|
| 120 m (the full column) | 0.17 (8 bands) | 0.26 (4 bands) | 0.52 (2 bands) |
| 90 m | 0.18 (6) | 0.32 (3) | 1.00 (1) |
| 60 m | 0.21 (4) | 0.46 (2) | 1.00 (1) |
| 30 m | 0.43 (2) | 1.00 (1) | 1.00 (1) |

These are the 12-operator figures. The 16-operator ones are within 0.015 of them.

- **The 400 ft column is nearly enough at 25 ft.** Eight bands come within a
  median 0.25% (12 operators) and 2.1% (16) of a stack with no ceiling. A stack
  with no ceiling would need roughly 145 to 200 m. I had predicted under 1% at
  both sizes, so that prediction failed for 16 operators.
- **The spacing is the expensive choice.** Going from 50 ft to 25 ft cuts the
  best plan's conflict weight by a median 31% (12 operators) and 37% (16).
  At 100 ft only two bands fit, and they leave about half the conflict weight.
  In this model a thinner spacing always wins. That holds because the model
  does not price what wider spacing buys, such as tolerance for altitude error
  and sensor noise. So the table is the conflict cost of a separation standard,
  not a recommendation for one.
- **Bands can be added one at a time.** One test grew the plan a band at a
  time. Each step inserted an empty band at the best slot and let operators
  move one at a time. This stayed within a mean 0.5% to 1.8% of re-planning
  from scratch at every count from 2 to 8. The catch is that each insertion
  moves a median 2 to 6.5 operators to a new band.

Four of the five predictions held. Everything is from a model, not from
flights. Launches are random, flights are straight legs, and there is no
avoidance or wind. The data covers one city, and the usable depth is swept,
not sourced. The results are preliminary.

Code, results and the full log are in
[`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/)
(`experiments/hub_airspace/band_budget.py`). The next step is to model
altitude-keeping error, which would let the model choose the spacing instead
of sweeping it.
