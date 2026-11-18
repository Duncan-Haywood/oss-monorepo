---
title: "With 16 drone operators, the cheap layer-split rule still works, but two layers are worth less"
seo_title: "Drone altitude-layer splits with 12 and 16 operators"
date: 2026-11-16
tags: [research, uav, airspace, reproducibility]
description: "A destination raster picks the best drone layer split among 32,767 with 16 operators and loses at most 0.44%. Two layers matter less as operators grow."
---

`aerolog-scaling` has been asking which drone delivery operators should share
an altitude layer. Until today every test used eight operators, so a planner
choosing between two layers had 127 possible splits. This afternoon's step
(11ab) found that a cheap "paper weight", a 100 m raster of where each
operator actually delivers, picks the best of those 127 splits in 65 of 72
fresh layouts.

A real city may have more operators than that. With 12 there are 2,047
two-layer splits, and with 16 there are 32,767. More splits means more
near-ties and more ways for a cheap rule to go wrong. **Today's second step
(11ac)** draws 24 random layouts of each size from the same generator and
scores the same rules against the noise-free closed form. That closed form
was checked against the simulator's exact expectation at eight operators.
The eight predictions were committed before any new layout ran.

| rule (what the planner needs) | mean loss, 12 operators | mean loss, 16 operators | best split found (12 / 16) |
|---|---|---|---|
| destination raster (paper weight) | **0.00%** (worst 0.09%) | **0.04%** (worst 0.44%) | 21 / 16 of 24 |
| census maps (residents plus jobs) | 1.4% to 1.5% | 0.8% to 1.1% | 11 / 6 of 24 |
| uniform service discs | 4.0% to 4.4% | 6.3% to 6.7% | 4 / 1 of 24 |
| hub distance | 11.9% | 10.1% | 0 / 0 of 24 |
| demand overlap / density heuristics | 20% / 29% | 16% / 23% | overlap 1 / 0, density 1 / 0 |

Seven of the eight predictions held. The raster's ranking survives, its
misses all fall on near-ties, and it costs about a fiftieth of the closed
form's CPU time. When it misses, its split is the second- to fourth-best of
thousands and differs from the best by one or two operators. With 16
operators, hub distance picks a split ranked around 477th, six operators away
from the best.

**The refuted prediction is the more useful result.** I expected the stake to
grow with more operators: how much worse an uninformed split is than the best
one. It shrank. With eight operators the average split leaves twice the best
split's conflicts. With 12 it is 1.6 times, and with 16 it is 1.5 times. The
reason is simple once you see it. One extra layer bit can separate only so
many interacting pairs. With 16 operators the best two-layer split still
leaves about a third of all en-route conflict weight together. Each
operator's conflicts with its own drones are only 2% to 3% of the total, so
almost everything left is cross-operator traffic that one bit cannot pull
apart.

**What a planner can take from it:** if you have the operators' delivery
destinations, the raster is as good as the full closed form for choosing a
two-layer split, at 12 or 16 operators as well as at eight. But in a crowded
city the split matters less than the number of layers. The next step asks
whether four layers (two bits) win back what two layers lose.

Limits: the closed form was checked against the simulator only at eight
operators. There are 24 layouts per size, one city, straight legs, no
avoidance or wind, and 2014 ride-hail pickups standing in for deliveries.
Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11ac.
