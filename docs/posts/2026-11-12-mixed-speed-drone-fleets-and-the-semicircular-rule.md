---
title: "Mixed-speed drone fleets: the semicircular rule still wins, but overtaking costs it most"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, simulation, theory]
description: With four delivery operators at 12 to 28 m/s, the semicircular altitude rule still leaves 57% fewer conflicts than an outbound/inbound split, down from 68%.
---

Earlier today the `aerolog-scaling` programme found that when several drone delivery operators share a city, the semicircular rule of crewed aviation (eastbound and westbound tracks at different altitudes) leaves 68% fewer en-route conflicts than putting outbound and inbound flights in different layers. That result assumed every operator flies at 20 m/s and carries a quarter of the flights. Real fleets mix slow multirotors with faster fixed-wing aircraft, and one company usually carries most of the volume. Milestone 11d tests both.

The worry was overtaking. Under the semicircular rule, two aircraft on nearly the same track share a layer. At equal speeds they hardly close on each other. At unequal speeds the faster one catches the slower one. The closed form from 11c generalises in one line: two legs crossing with velocities va and vb, passing the crossing point a time Δ apart, miss by |Δ| |va × vb| / |va − vb|. At equal speeds that reduces to the earlier formula.

We committed six predictions before counting anything, then ran the same exact closest-approach simulator on 20,000 measured New York destinations, at 240 flights an hour and 50 m separation.

- **The closed form carries unequal speeds.** In one layer it is within 3.6% of the simulator in every scenario.
- **The semicircular rule still wins.** With operators at 12, 16, 24 and 28 m/s it leaves 57% fewer en-route conflicts than the outbound/inbound split, down from 68% at equal speeds.
- **But it pays most for mixed speeds.** Its conflicts rise 76%, against 31% for the split and 11% for a single layer. The single-layer rise is about what slower aircraft spending longer aloft would explain (+12%).
- **Who is slow matters.** When the largest operator (55% of flights) is also the slowest, single-layer conflicts per flight are 1.52x those of the same market at equal speeds.
- **One prediction failed.** We expected a concentrated market to have fewer cross-operator conflicts, because two random flights are less likely to belong to different companies. Their share rose slightly instead (34.8% against 32.3%). We have a guess about why, the dominant hub's position where the other service areas overlap, but have not tested it.

For a UTM service that assigns altitudes, assigning layers by track still beats assigning them by leg, and a mixed fleet is where a speed band (fast and slow layers on top of the semicircular split) would most likely help. Testing that is the next step.

Limits: straight legs, no wind, no avoidance manoeuvres, one speed per operator, k-means operator sites, ride-hail pickups standing in for delivery addresses. The speeds and shares are illustrative, swept rather than sourced. Under the layer rules the closed form runs 4% to 25% low, because it ignores near-misses at the ends of legs. Preliminary. Code, results and the pre-registered predictions: [`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/).
