---
title: "Hub distance is not enough to assign drone operators to altitude layers"
seo_title: "Drone altitude layers: traffic model vs hub distance, 24 layouts"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, graph-partition]
description: On 24 random eight-operator layouts, assigning drone layers by hub distance left a median 14% more en-route conflicts than the closed form, up to 75% more.
---

This morning's milestone (11f) ended on a convenient note. Eight drone delivery operators were sharing New York, and we had to choose which of them share an altitude layer. Max-cut on the closed-form conflict weights found the simulator's best split. But a much cheaper rule, each operator pair's market shares divided by the distance between their hubs, came within 2.2% of it. A regulator has those numbers on day one. So did the traffic model earn its keep?

That layout was a friendly one: every operator served a 5 km disc, and the hubs sat at k-means sites. Milestone 11g of the `aerolog-scaling` programme drops that assumption. Instead of hand-building a layout where distance fails, which would pick the answer in advance, it draws 24 layouts at random. Hubs sit at random New York destinations at least 800 m apart. Service radii range from 1.5 to 8 km, speeds from 12 to 28 m/s, and market shares are random. Eight predictions were committed and pushed before the first layout was drawn.

- **The closed form stays at the best split.** On a fresh simulation its two-group split is within 1.6% of the simulator's own best in all 24 layouts, and it is the same split in 20. Its pair weights correlate with the simulator's at r = 0.994 or better in every layout.
- **Distance breaks.** Market share over hub distance leaves at least 5% more en-route conflicts in 19 of 24 layouts: 1.14x at the median and 1.75x at worst. It finds the best split in only 2 of 24.
- **Shared customers are still the wrong proxy.** Two weights built from the destinations two operators both serve do worse than distance (median 1.16x and 1.20x). A new "density" weight we expected to beat distance did not.
- **One prediction was too strong.** Distance does lose more where its ranking of operator pairs disagrees with the closed form's, but only weakly (Spearman -0.32 against our -0.4 bar). What matters is the few heaviest pairs near the cut, not the ranking as a whole.

For a UTM designer: when operators differ in reach and speed, a cheap geometric rule is not a safe substitute for a conflict model. The model in question is not a big simulation. It is a closed form that runs in seconds from hub sites, service areas, speeds and shares, and its max-cut can be solved exactly by enumeration at city scale.

Limits: straight legs, no wind, no avoidance manoeuvres, no terminal procedure, ride-hail pickups standing in for delivery addresses, radii, speeds and shares drawn from chosen ranges rather than real operators, one city. Preliminary. Code, per-layout results and the pre-registered predictions: [`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/).
