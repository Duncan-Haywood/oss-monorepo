---
title: "Drone delivery with several operators: hubs never collide, operators do, and the semicircular rule helps"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, simulation, theory]
description: One operator's hubs never interfere. With four overlapping operators, a third of conflicts are crossings; the semicircular rule leaves 3x fewer.
---

The last two steps of the `aerolog-scaling` programme counted how often one delivery hub's own drones lose separation in a cruise layer, and found a closed form that predicts it to about 1% from the destination map alone. Today's step (milestone 11c) asks what happens when a city has several hubs, and several companies.

One thing was clear before any code ran. If one operator sends each order to its nearest hub, each hub's destinations lie in its Voronoi cell. That cell is convex and contains the hub, so every straight flight stays inside it. Flights from different hubs of the same operator never cross. Crossing traffic needs service areas that overlap, which in practice means more than one operator.

We wrote seven predictions into the script's docstring, committed them, then ran an exact closest-approach simulator on 20,000 measured New York destinations (Uber pickups, April 2014) at 240 flights an hour, 20 m/s cruise and 50 m separation.

- **One operator's hubs never interfere.** Zero cross-hub conflicts in 60,000 flights at 2, 4 and 8 hubs. Going from 1 hub to 8 cuts en-route conflicts per flight from 0.40 to 0.023, about K^-1.4.
- **Several operators do.** With four operators whose 5 km service areas overlap, 31.5% of en-route conflicts in one layer are crossings between operators. A closed form derived here adds a crossing term to the head-on one: two drones that pass a crossing point a time Δ apart miss by v|Δ|cos(α/2). It matches the simulator within 7.4% in every single-layer case.
- **The gas model is still low.** The usual uniform-traffic estimate is 3.4x below even the crossing part, because crossings happen near hubs, where traffic is dense. We had predicted it would land within a factor of 2, so that prediction failed.
- **The altitude rule matters.** With two layers, separating outbound from inbound flights leaves 23.7% of one layer's en-route conflicts. The semicircular rule crewed aviation already uses (eastbound and westbound tracks at different altitudes) leaves 7.6%, 68% fewer. Four layers, both rules at once, leave 3.2%.

The direction split works for one operator, where all traffic is head-on along each bearing. Between operators it keeps outbound-outbound crossings, and some of those are nearly head-on. A rule based on track direction separates those pairs, and it still removes almost all of one operator's head-on traffic (1.2% left). For anyone designing a UTM service that assigns altitudes, assign layers by track, not by leg.

Limits: straight legs, equal speeds, no wind (the previous step covers wind for one hub), no avoidance manoeuvres. Operator sites are k-means placements with equal shares, not real companies' hubs. Pickups stand in for delivery addresses. Under the layer rules with four operators, the closed form runs 11% to 24% below the simulator, because it ignores near-misses at the ends of legs. Preliminary. Code, results and the pre-registered predictions: [`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/).
