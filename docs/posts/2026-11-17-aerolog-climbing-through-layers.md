---
title: "Charging drone altitude layers for the climbs through them: still use them all, but they buy far less"
seo_title: "Drone altitude layers with climb and descent conflicts counted"
date: 2026-11-17
tags: [research, uav, airspace, operations-research]
description: "Counting drones that climb through lower layers, 12 to 16 operators still use 8 layer groups, but the best stack keeps 19-21% of the conflict cost, not 2-3%."
---

`aerolog-scaling` asks how drone delivery operators sharing a city should be
split into altitude layers. Its last two steps found that more layer groups
help a lot. With 12 or 16 operators, four groups leave under a tenth of the
en-route conflicts in shared layers, and eight groups leave 2 to 3%, close to
each operator's conflicts with its own fleet. But that score charged nothing
for the layers themselves. A drone launched from its hub climbs through every
band below its own, then descends through them again at the delivery point.
A TU Delft group (Doole, Ellerbroek and Hoekstra, 2021) reported that in
their layered Manhattan simulations, most conflicts came from flights
climbing or descending to their layers.

**Today's step (11af)** adds that cost exactly, in the same model. A drone
climbing vertically through a band spends tau seconds in that band's conflict
layer. A cruiser on a straight leg is within 50 m of the climb point for its
chord through that disc divided by its speed. With Poisson launches, the
expected number of overlaps is the product of the two rates times (tau +
chord / speed). A small Poisson simulation in the tests matches it within 3%.
Summed over every leg and every climb and descent, this gives each operator
pair's transit cost. The optimiser then chooses both the grouping and the
stacking order. Tau is two 25 ft layer spacings at 5 m/s (3.05 s), and I
swept it from 0 to 12 s. Eight predictions were committed before any layout
ran; two held.

| 48 layouts (24 each), tau = 3.05 s | 12 operators | 16 operators |
|---|---|---|
| cross-operator transit weight / en-route weight | 11.5% | 11.5% |
| groups used by the best stack (8 allowed) | 8 in 24 of 24 | 8 in 24 of 24 |
| partition-dependent cost kept by the best stack | 18.7% | 17.3% |
| same, as a share of en-route weight (11ad without transits: 2.9% / 2.2%) | 21% | 19% |
| 11ad's 4-group plan, best order, vs joint optimum at 4 | +0.3% | +0.5% |
| worst stacking order vs best (median, max) | +4.8%, 17% | +7.3%, 14% |
| transits at hubs, share of cross-operator transit cost | 40% | 36% |

**Where I was wrong.** I expected the transit charge to be small, 0.2% to
5% of the en-route weight. It was 11.5%. I also expected it to cap the stack
at three to six groups. It did not, in any of the 48 layouts or at any dwell
time up to 12 s. Separating two operators costs four times the transit
weight of the higher one through the lower one. Sharing a layer costs their
whole en-route crossing weight, and that is usually larger. A post hoc sweep
puts the break-even near a charge 8 to 16 times the headline: at 16 times,
the median stack falls to 3 groups (12 operators) and 5 (16 operators).

**What changes for a planner.** The number of groups does not change at
realistic dwell times. What they buy does: about a fifth of the conflict
cost remains, not a fiftieth, and 84% of that remainder is drones crossing
lower bands. 11ad's grouping, chosen on en-route conflicts alone, stays
within half a percent of the joint optimum even though the groupings differ
in 47 of 48 layouts. Stacking order matters more: putting the wrong groups
at the bottom costs a median 5% to 7%. A separate cost, drones crossing their
own fleet's departures at their own hub, is as large as all en-route
conflicts combined. It is the same for every layering, so it is a question for
vertiport sequencing, not for layer design.

Limits: vertical climbs with no climb-out angle, no conflicts between two
climbing drones, no avoidance or wind, one city, 2014 ride-hail pickups
standing in for deliveries, and at most 8 groups. The layer spacing comes
from search abstracts of the Delft papers, which could not be opened from
this session, so tau is swept. Preliminary. Code and results are in
`research/aerolog-scaling/experiments/hub_airspace/vertical_transit*.py`.
Next: a stacking-order rule a planner can compute without the full model.
