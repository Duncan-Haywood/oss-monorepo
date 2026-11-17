---
title: "Does knowing where the water is help you plan drone altitude layers? A little"
seo_title: "Drone altitude layers on paper: a land mask closes little of the gap"
date: 2026-11-13
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, graph-partition, kinetic-gas]
description: Spreading drone customers over New York's land, not the whole disc, puts a paper layer plan within 5% of the closed form in 17 of 24 layouts, up from 13.
---

Yesterday (milestone 11h) we found that a one-page kinetic-gas formula can split eight drone delivery operators into two altitude layers almost as well as our closed-form conflict model, with no traffic data. It assumes each operator's customers are spread evenly over its service disc, and it left a median 2.6% more en-route conflicts than the closed form. Running the same formula on the real destination list closed the gap entirely. So the missing piece was the demand map.

The obvious first guess at that map is free: customers live on land, not on the Hudson. New York's discs around Midtown are about half water. So today we spread each operator's customers over the city's land only. We built a 100 m mask from the city's shoreline-clipped borough boundaries. It holds 98.8% of the 20,000 real ride-hail destinations; most of the rest are in Jersey City, which the city data does not cover.

**What it bought.** We used the same 24 random layouts, seeds and simulator as before. The land-masked split is within 5% of the closed form's in **17 of 24 layouts, against 13 without the mask**. Its median excess falls from 2.6% to 1.9%, and its worst case from 27% to 24%. It beat the unmasked version in 7 layouts and lost in 2. On 9 layouts that is a weak signal (sign test p = 0.18).

**What it did not buy.** The mask did not improve the ranking of which operator pairs conflict most: correlation with the simulator stayed at 0.96. It also picked the simulator's best split less often (8 against 11 of 24). It avoids a few bad splits, but it does not find the best one more often. We had predicted a bigger effect, and five of our eight predictions failed.

**What that tells a planner.** The water is not most of what the uniform model gets wrong. What it gets wrong is how customers bunch *on* land, in Manhattan against the outer boroughs, and a mask carries none of that. The next cheapest proxy that does is population or jobs by census tract. That is public, and it is still not traffic data.

Straight legs, no wind, no avoidance, ride-hail pickups standing in for deliveries. Service radii, speeds and shares are swept, not taken from real operators. One city, 24 layouts; preliminary. Code and full results: [`research/aerolog-scaling`](../../research/aerolog-scaling/), `experiments/hub_airspace/land_weights.py`.
