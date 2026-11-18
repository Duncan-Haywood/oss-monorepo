---
title: "Census jobs data tells you which drone operators will conflict. It doesn't yet tell you how to split them"
seo_title: "Drone altitude layers from census data: jobs fix the ranking"
date: 2026-11-13
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, graph-partition, census, lodes]
description: Weighting drone customers by census jobs makes paper conflict weights match the simulator (r 0.99, was 0.96); jobs plus residents match the split's median.
---

This morning's step (milestone 11i) ended on a guess. Spreading each delivery operator's customers over New York's land, rather than its whole service disc, barely helped a paper formula choose which of eight drone operators should share an altitude layer. The missing information seemed to be *how densely* customers sit on land. The cheapest public map of that is the census.

So we weighted each operator's destinations by two Census Bureau datasets:

- **where people live**: 2020 population at each block group's population centroid (3.19 million residents inside our 10 km window);
- **where people work**: LEHD LODES 2022 job counts at each census block (3.06 million jobs in the same window).

Everything else was the same as before: the same 24 random eight-operator layouts, simulator, kinetic-gas integral and scoring. We wrote nine predictions down and pushed them before computing a single weight.

**What jobs fixed.** The paper weights now rank which operator pairs conflict most almost exactly as the simulator does. The median correlation is **0.990**, against 0.964 with the land mask. The worst layout is 0.948, against 0.692. The scale is right too: total predicted conflicts are 1.01 times the closed form's, against 0.74 with the land mask and 0.54 with uniform discs. Residents alone did not help (r 0.965). At block-group resolution, where people live carries little that the land mask didn't already.

**What it did not fix.** The two-layer split those weights choose is barely better. Its median is 1.2% more en-route conflicts than the closed form's pick, against 1.9% with the land mask. It is within 5% of the closed form in 17 of 24 layouts, the same as before. Jobs repaired three layouts where every earlier paper weight had been 15% to 24% off, but broke three others. Two layouts are missed by every demand map we tried, so their error comes from something other than demand. Five of the nine predictions failed.

**The best paper weight so far: residents plus jobs.** Treating each flight as going either to a home or to a workplace, with the counts simply added, gives a split whose **median matches the closed form (excess 0.0%)**. It is within 5% in 18 of 24 layouts and picks the simulator's best split in 12 of 24. It was never worse than jobs alone and better in 6 layouts (sign test p = 0.03). We did not pre-register that comparison, so treat it as a lead.

**What a planner can take from this.** Public census data is enough to work out *which operators' traffic will collide*, without any traffic records and in half a second per layout. Choosing one split by max-cut on those weights is still fragile. Our untested guess is near-ties: several splits score almost the same, so a small error in one pair weight changes the choice and costs 5% to 20% out of sample. The next step tests that guess. A planner would pick the split that stays good when the weights are perturbed, rather than the single max-cut.

Straight legs, no wind, no avoidance; 2014 ride-hail pickups stand in for deliveries. Service radii, speeds and market shares are swept, not taken from real operators. One city, 24 layouts; preliminary. Code, data extract and full results: [`research/aerolog-scaling`](../../research/aerolog-scaling/), `experiments/hub_airspace/demand_weights.py`.
