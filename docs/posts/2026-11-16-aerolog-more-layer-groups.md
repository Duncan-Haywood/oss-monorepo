---
title: "How many altitude layers do 16 drone delivery operators need? Four groups leave 8% of conflicts, not a third"
seo_title: "Drone delivery altitude layers: how many groups, and how to add them"
date: 2026-11-16
tags: [research, uav, airspace, reproducibility]
description: "Four jointly chosen layer groups leave 8% of drone conflicts against a third for two; splitting each group again instead costs 15% more. Pre-registered."
---

`aerolog-scaling` asks which drone delivery operators should share an altitude
layer when many fly over one city. This afternoon's step (11ac) found that with
12 or 16 operators, even the best two-way split leaves about a third of the
en-route conflicts in shared layers, and is only about 1.5 times better than
splitting at random. One group bit cannot keep most interacting pairs apart. So
the next question was how much more layers buy, and how a planner should add
them.

**Today's step (11ad)** takes the same 48 random layouts (12 and 16 operators
around Manhattan, 2014 New York pickups as destinations, 240 flights an hour),
using the simulator-checked closed form for each pair's conflict rate. It finds
the best partition of the operators into 2, 3, 4 and 8 layer groups. Search is
exhaustive where it is affordable (up to four groups with 12 operators) and
uses 200-restart local search elsewhere. The local search matched the
exhaustive optimum in 48 of 48 checks. The eight predictions were committed
before any layout was scored.

| layer groups | conflict weight left, 12 operators | 16 operators |
|---|---|---|
| 1 (everyone shares) | 100% | 100% |
| 2 (one group bit) | 32.5% | 34.1% |
| 3 | 14.0% | 15.8% |
| 4 (two bits) | **7.6%** | **8.7%** |
| 8 (three bits) | 2.9% | 2.2% |
| floor: each operator's own self-conflicts | 2.8% | 2.0% |

Medians over 24 layouts each. The semicircular rule (direction of flight)
applies inside every group.

**Three predictions were refuted, all in the same direction.** I expected four
groups to leave 10% to 20% and the second bit to remove around half of what the
first bit leaves. It removes three quarters. Three bits leave little more than
each operator's conflicts with its own drones, which no layer assignment can
separate.

**The cheap rule still works.** A 100 m raster of where each operator actually
delivers finds the best four-group partition to within 0.2% on average, and
the exact best in 17 of 24 layouts at both sizes. The ranking of rules is the
same as for two layers: census maps lose 1.6% to 2.9%, uniform service discs
8% to 9%, and hub distance 31%, about three times its two-layer cost.

**The surprise is how not to add layers.** A planner that already has a
two-group split might add a second bit by dividing each group in two. I
predicted that greedy route would cost 0.2% to 5% against re-planning all four
groups jointly. It costs a mean **15%** (worst 74%), and it is worse in 23 of
24 layouts at both sizes. The best two-way split is usually not a coarser
version of the best four-way partition. When you add layers, re-plan the whole
assignment.

Limits: the score counts en-route conflicts within a group only. It does not
charge for drones climbing through occupied bands near the hubs, or for the
vertical airspace each extra band uses, so the table is an upper bound on what
layers buy. The model has straight legs, no avoidance and no wind, in one city.
The next step is to put a cost on each band so that the number of groups is
chosen rather than assumed. Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11ad.
