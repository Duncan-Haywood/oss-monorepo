---
title: "Drone layers: counting conflicts without simulating launch times"
seo_title: "Drone conflict counts with launch timing integrated out exactly"
date: 2026-11-14
tags: [research, robotics, autonomy, utm, drones, airspace, simulation, statistics, monte-carlo]
description: "An exact-timing drone conflict estimator matched the simulator, ran only 1.5x faster, and found the closed form 7% low yet picking the right layer split."
---

The [last step](2026-11-14-drone-layers-a-million-flight-recount.md) of [`aerolog-scaling`](../../research/aerolog-scaling/) re-scored every rule for splitting delivery-drone operators between altitude layers on a million simulated flights. The ranking held, but some per-layout intervals were still ±3 to 5%. The obvious next move was a better estimator rather than more flights.

## The idea

The simulator launches flights as a Poisson process, flies straight out-and-back legs, and counts a conflict whenever two legs in the same layer come within 50 m. Nothing reacts to anything else. So the expected number of conflicts is a sum over pairs of flights. For a given pair of paths, the departure offsets that make them meet form an interval. In the two legs' own time coordinates, "within 50 m" is an ellipse (a strip if the legs are parallel), cut by the box of times each leg is airborne. The set of conflicting offsets is that convex shape projected onto one line, and its two ends have a closed form.

So you can sample pairs of paths, add up exact interval lengths, and never simulate a launch time. I checked the interval code against a brute-force scan on 3,000 random leg pairs and found no mismatches. I pushed seven predictions before running it on the 24 layouts ([`exact_timing.py`](../../research/aerolog-scaling/experiments/hub_airspace/exact_timing.py)).

## It's correct, and only a little faster

Over the 24 layouts the exact estimate is 1.0005 times the simulator's. Three layouts sat outside the simulator's interval, so I recounted the two worst with fresh seeds (a check I hadn't planned). Both were noise: 0.9999 and 0.9959.

Speed was the point, and it disappointed. Per CPU second it's about 1.5 times as efficient as the simulator, not the 3 times I'd predicted, and it's worse in a few layouts. Removing the timing noise leaves the noise from sampling paths. That noise is heavy-tailed, because a few near-parallel pairs from the same operator have very long conflict intervals. The next gain has to come from sampling those pairs on purpose.

## The closed form is 7% low and still right

The useful result was a side effect. Since milestone 11d, the programme has chosen layer splits with an approximate closed form. It uses infinite-line crossing windows and labels the zone at the crossing point. Against the exact expectation:

| | across 24 layouts |
|---|---|
| closed form ÷ exact, en-route conflicts | 0.928 (0.884 to 0.970) |
| correlation of the 28 operator-pair weights | r ≥ 0.998 in every layout |
| closed form's split within 0.05% of the exact optimum | 22 of 24 layouts |
| worst gap to the exact optimum | 0.35% |

The closed form undercounts by 3 to 12%, but almost uniformly, so its ranking of operator pairs is nearly exact. Every split it chose stands. The rule means don't move either: the real-map paper split is 1.001 of the closed form's, the stop-when-unchanged rule 1.009, and census-only weights 1.031.

Three of seven predictions held and three failed: the estimator matched the simulator in only 21 of 24 layouts against the 22 I'd predicted, and both speed-up predictions missed. The seventh split. The pair correlation held, but I'd guessed the closed form's level would be within 10% everywhere, and two layouts miss that.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts. The estimator is exact only for this model; wind or avoidance manoeuvres break the interval geometry. Preliminary. Full results: [`exact_timing_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/exact_timing_results.txt).
