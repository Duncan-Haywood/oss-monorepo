---
title: "Extra drone altitude layers: separate the overlapping operators, not the speeds"
seo_title: "Drone altitude layers: operator pairing vs speed band vs leg direction"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, theory]
description: With four delivery operators, layering apart the most-overlapping ones cut en-route conflicts 2.3x to 3.7x against an in/out split. Speed bands did worse.
---

Earlier today the `aerolog-scaling` programme found that the semicircular rule (eastbound and westbound tracks at different altitudes) still works best for a mixed fleet of delivery drones. Mixed speeds cost it the most, though: faster aircraft on near-parallel tracks overtake slower ones. The obvious next idea was a speed band, with fast and slow drones in different layers on top of the semicircular split. Milestone 11e tests that idea against the alternatives.

Look at it this way. With four operators, a speed band is just one way of splitting them into two pairs. There are three such splits, and the operators' service areas overlap by very different amounts: their hubs sit 3.4 to 9.4 km apart, and each serves everything within 5 km. So the real question is what the extra layer bit should separate. Leg direction (outbound against inbound)? Speed? Or particular operators, and if so, which ones?

We committed eight predictions before counting anything. Then we ran the same exact closest-approach simulator on 20,000 measured New York destinations at 240 flights an hour, with 50 m separation, across twelve layer rules and three fleet mixes.

- **Separate by geography.** Putting the two pairs of hubs 6.8 km apart in different layers, on top of the semicircular rule, leaves **3.2x fewer en-route conflicts** than semicircular plus an outbound/inbound split at equal speeds. With mixed speeds the figure is 2.3x, and 3.7x when the largest operator is also the slowest.
- **The speed band loses.** With operators at 12, 16, 24 and 28 m/s, semicircular plus a speed band leaves 0.0164 en-route conflicts per flight, against 0.0115 for semicircular plus leg direction. Here the two slowest operators also have the closest hubs, so a speed band keeps the most-overlapping pair together.
- **A planner can choose without a simulator.** In two of the three fleet mixes, the closed form from 11c and 11d ranks the five four-layer rules in exactly the simulator's order. In the third it swaps two rules that are tied within sampling noise. Either way, its top choice is always one of the best.
- **The catch is at the hub.** Operator pairing does nothing for conflicts within 250 m of a hub, because those all involve one operator's own drones, and that is where splitting outbound from inbound halves them. Count every conflict and semicircular plus leg direction still wins (0.062 against 0.081 per flight at equal speeds). Which rule is better depends on whether a hub's terminal area is handled by its own procedure or shares the en-route layers.
- **Three predictions failed outright.** The speed band (above), eight layers buying less than expected at equal speeds (62% of the best four-layer rule's conflicts, against a predicted 40% or less), and the closed form running 30% low in one case with 259 counts.

What a UTM service might take from this: once track or leg direction has split each operator's own traffic, nearly all the en-route conflicts left are between operators. The next layer is best spent keeping apart the operators whose service areas overlap most, and the closed form can find that grouping from hub sites and demand in seconds.

Limits: straight legs, no wind, no avoidance manoeuvres, k-means operator sites, ride-hail pickups standing in for delivery addresses, and illustrative speeds and shares. Four operators allow only three pairings. With more operators the grouping becomes a graph-partition problem, which is the next step. Preliminary. Code, results and the pre-registered predictions: [`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/).
