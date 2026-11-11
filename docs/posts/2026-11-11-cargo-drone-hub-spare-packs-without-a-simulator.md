---
title: "Sizing a cargo-drone hub's spare batteries with a formula instead of a simulator"
seo_title: "Drone battery swap hub: how many spare packs? A closed-form M/D/c rule"
date: 2026-11-11
tags: [research, aerolog-scaling, drone-logistics, queueing]
description: "For a battery-swap drone hub with 8 chargers, a short queueing recursion gives the same spare-pack count as the simulator: 12 to 45 packs."
---

The aerolog-scaling programme has been sizing a battery-swap hub for a cargo
VTOL by simulation: 8 pads, 8 chargers, a 42-minute charge and 3 minutes on the
pad. Each answer took a grid search over pack counts. This milestone asks whether
a formula gives the same answers.

The rule: a flight waits for a pack when the number of packs not yet charged
reaches the pool size S. Packs at the chargers form an M/D/c queue (constant
charge time). Its distribution follows exactly from a one-step recursion,
N(t+D) = max(N(t) − c, 0) + arrivals in D, the method Crommelin used in 1932.
Packs between the pad and the charger add a Poisson count. In pure Python the
whole calculation takes half a second.

Smallest pool with at most 5% of orders waiting:

| Hub load | Orders | Formula | Simulator |
|---|---|---|---|
| 70% | single | 12 | 12 |
| 70% | pairs | 16 | 16 |
| 70% | batches of 4 | 25 | 25 |
| 85% | single | 17 | 17 |
| 85% | pairs | 26 | 26 |
| 85% | batches of 4 | 45 | 45 |

Two of my three predictions failed. I expected the formula to err on the safe
side, and it errs on the other. A flight that waits sends its empty pack to the
charger late, which makes the next shortage worse. With the pool within about 2
packs of the mean count, the formula under-states waiting by up to 40 points;
pools that small are far below anything you would build. Second surprise:
batches of 8 orders at 8 pads leave about 5% of orders waiting however many packs
the hub holds. That is the chance that a second batch lands while all the pads
are busy, a pad limit and not a battery one.

Limits: constant charge time, fixed batch sizes, steady demand. Code, results
and log: `research/aerolog-scaling/` (milestone 6h).
