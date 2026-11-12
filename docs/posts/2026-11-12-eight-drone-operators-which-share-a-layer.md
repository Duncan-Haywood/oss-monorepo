---
title: "Eight drone operators, four altitude layers: who should share?"
seo_title: "Drone altitude layer assignment as max-cut: eight delivery operators"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, graph-partition]
description: Max-cut on closed-form conflict weights found the best two-group operator split every time. Market share over hub distance came within 2.2%.
---

This morning's milestone (11e) found that once the semicircular rule has separated eastbound from westbound drones, the next altitude layer is best spent keeping apart the delivery operators whose service areas overlap most. With four operators there were only three ways to pair them. With eight there are 127 ways to split them into two groups, and the choice becomes a graph problem: give each pair of operators a weight (the conflicts their drones would have in a shared layer) and cut the heaviest pairs. That is max-cut.

Milestone 11f of the `aerolog-scaling` programme tests that framing. We placed eight operators at k-means sites over 20,000 measured New York destinations, each serving everything within 5 km, at 240 flights an hour with 50 m separation, in three fleet mixes: equal shares at one speed, equal shares at 12 to 28 m/s, and a concentrated market where the largest operator is the slowest. Nine predictions were committed before anything was counted.

One observation made the study cheap. Under "base rule plus operator group", a conflict between two drones counts exactly when it counts under the base rule and both operators sit in the same group. So a single simulation with per-pair counts scores every partition on the same flights. A test and the run itself confirm it to the count.

- **The closed form picks the best split.** Its pair weights correlate with the simulator's at r = 0.998 to 1.000, and its max-cut is the simulator's own best of all 127 splits in every scenario, checked on a fresh run.
- **The best split leaves a fifth to under a third.** On top of the semicircular rule it leaves 20% to 29% of the en-route conflicts, against about 44% for an average four-four split. Nearly all (97% to 99%) of what the semicircular rule leaves is between operators.
- **A planner barely needs the model.** Max-cut on market share divided by hub distance, numbers a regulator has on day one, picks the same split in two scenarios and is 2.2% worse in the third. We predicted the closed form would beat it by 5%; it did not.
- **Shared destinations are the wrong proxy.** Splitting by how many addresses two operators both serve is 1.3x to 1.6x worse than the best. Crossings come from nearby hubs whose legs fan through each other, not from shared customers.
- **Speed is the worst informed choice.** Fast against slow leaves 1.5x to 2.7x the best split's conflicts.
- **Eight layers: operators beat leg direction en route, not at the hub.** A four-group operator split leaves about half the en-route conflicts of leg direction plus a two-group split, but it does nothing for conflicts within 250 m of a hub, so on all conflicts leg direction wins again, as in 11e.

What a UTM designer might take from this: assigning operators to layers is a small max-cut, solvable exactly by enumeration at city scale, and in this layout distance between hubs carries most of the signal. The next step looks for layouts where the cheap heuristic and the closed form disagree, such as nearby hubs with very different speeds or radii.

Limits: straight legs, no wind, no avoidance manoeuvres, k-means operator sites, ride-hail pickups standing in for delivery addresses, illustrative speeds and shares, one city. Preliminary. Code, results and the pre-registered predictions: [`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/).
