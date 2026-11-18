---
title: "Which cheap rule splits drone operators into altitude layers? Tested on 72 fresh city layouts"
seo_title: "Drone altitude-layer split rules on 72 fresh layouts"
date: 2026-11-16
tags: [research, uav, airspace, reproducibility]
description: "A 100 m map of real delivery destinations picks the best drone layer split in 65 of 72 fresh layouts; hub distance loses 14%. Pre-registered, out of sample."
---

`aerolog-scaling` asks a practical airspace question. When eight drone delivery
operators share a city, which of them should share an altitude layer? Put the
wrong two operators together and their drones meet more often. The programme
has a closed form for the expected conflicts between every pair of operators,
and this morning's milestone (11aa) checked it against the simulator's exact
expectation: 0.26% apart, and the same best layer split in 24 of 24 layouts.

A planner will not always run that closed form. It costs about 100 CPU seconds
per layout and needs every operator's full destination list. So the earlier
milestones compared cheaper rules: hub distance (the rule you could apply with
no data at all), service-disc overlap, census maps, and a "paper weight", a
100 m raster of where each operator actually delivers. All of those comparisons
used the same 24 random layouts. A ranking found on 24 layouts, and a census
blend fitted on them, could be tuned to those 24.

**Today's step (11ab) draws 72 fresh layouts** from the same generator
(random hub sites within 7 km of a Manhattan hub, service radii 1.5 to 8 km,
speeds 12 to 28 m/s, random market shares, 2014 New York pickup points as
destinations). It scores 13 rules on them against the simulator-checked closed
form. The blends are refitted on the old 24 layouts only. The nine
predictions were committed before any new layout ran.

| rule (what the planner needs) | mean loss on 72 fresh layouts | best split found |
|---|---|---|
| destination raster + take-off term | **0.09%** | 66 of 72 |
| destination raster (paper weight) | 0.15% | 65 of 72 |
| census maps (residents and jobs), 5 variants | 1.4% to 2.0% | 43 to 48 of 72 |
| uniform service discs | 5.8% | 32 of 72 |
| hub distance | 14.4% | 9 of 72 |
| demand overlap / density heuristics | 20% / 28% | 7 / 4 of 72 |

Loss is the extra en-route conflicts of the rule's split over the best of the
127 two-layer splits. For scale, the average split leaves **twice** the best
split's conflicts (median; up to 7.5 times), so the choice matters.

**Eight of nine predictions held.** The tiers keep their order out of sample.
Every paper-weight mean is within 0.02 of its value on the old layouts, and all
240 of the old layouts' cells reproduce to the last printed digit. The
destination raster's seven misses sit mostly on near-ties, where the best two
splits are within 0.7% of each other. Its two real misses (4.0% and 4.2%) are
not. The take-off term fixes one of them.

**The refuted one** is a small, useful surprise. I predicted that 11w's census
blend (a fitted mix of jobs and residents) would gain nothing over the plain
census weight. Refitted on the old 24 layouts, it beats the plain weight by
0.54% on the new 72, just past the 0.5% I allowed. On the old layouts it had
been slightly worse. The census rules also all do better on the new layouts
than on the old ones, by 0.9% to 1.9%. The original 24 were a hard draw for census
maps.

**What a planner can take from it:** if you have the operators' delivery
destinations, a 100 m raster of them is as good as the full closed form for
choosing layers, at about a thirtieth of the cost. With census maps alone,
expect to lose 1% to 2%. With nothing but hub positions, expect 14% on average,
and more than 10% on almost half of layouts.

Limits: the reference is the closed form, which was checked against the
simulator on the old 24 layouts, not on these 72. The model has straight legs,
no avoidance and no wind, in one city, with ride-hail pickups standing in for
deliveries. Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11ab.
