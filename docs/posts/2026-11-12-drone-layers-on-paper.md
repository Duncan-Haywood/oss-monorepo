---
title: "Choosing drone altitude layers on paper: a one-page formula gets most of the way"
seo_title: "Drone altitude layers without traffic data: a gas model on paper"
date: 2026-11-12
tags: [aerolog-scaling, drones, airspace, uam, utm, simulation, graph-partition, kinetic-gas]
description: A kinetic-gas formula on uniform service discs picks drone layers a median 2.6% off the closed form, against 13.6% for hub distance, with no traffic data.
---

Earlier today (milestone 11g) we found that splitting eight drone delivery operators into two altitude layers by hub distance leaves a median 14% more en-route conflicts than splitting them with our closed-form conflict model. That model, though, samples 400,000 pairs of flight legs from a real list of destinations. A regulator drawing up layers for operators who have not started flying does not have that list. So how much of the gain can they get on paper?

**The formula.** Every flight goes straight out from its hub and straight back. So at any point, all of one operator's aircraft move along the line from its hub, either outbound or inbound. If you know how much flight path the operator puts through each patch of sky, you know its aircraft density there. Two crossing streams of aircraft lose separation at a rate proportional to the product of their densities times their relative speed. This is the old kinetic-gas model of air traffic. Earlier milestones found its usual form, one average density over the whole area, three to seven times too low; here the density varies point by point, thickest at each hub. Assume each operator's customers are spread evenly over its service disc, sum over a 100 m grid, and keep only the pairs the semicircular rule puts in the same layer. The inputs are hub sites, service radii, cruise speeds and market shares. All four are known before the first flight.

**What it got.** We used the same 24 random New York layouts, seeds and simulator as 11g, and each method picked the split it rated best. On paper the formula's split leaves a **median 2.6% more en-route conflicts** than the closed form's. Hub distance leaves 13.6% more. So the formula recovers about four fifths of the closed form's edge. It runs in 0.13 CPU seconds per layout, a fifteenth of the closed form's time. It is not uniformly good: in 11 of 24 layouts it misses by 6.7% to 27%. A hub-distance rule corrected for speed did no better than plain distance.

**Where the rest of the gap comes from.** Run the same grid integral on the real destination list and it reproduces the closed form: pair weights agree with r of 0.995 or better, and it lands within 2.1% in all 24 layouts. So the formula itself is sound. What is missing is the demand map. Real customers bunch on land and in dense neighbourhoods, not evenly over the water. Here the paper model put about half as many conflicts on each pair as the simulator counted. That error does not change most rankings, but it decides the worst cases.

The next step is the cheapest piece of demand information a planner has: spread customers over land only, and see how much of the remaining fifth that closes.

Straight legs, no wind, no avoidance, ride-hail destinations standing in for deliveries. Radii, speeds and shares are swept, not taken from real operators. Preliminary. Code and full results: [`research/aerolog-scaling`](../../research/aerolog-scaling/), `experiments/hub_airspace/paper_weights.py`.
