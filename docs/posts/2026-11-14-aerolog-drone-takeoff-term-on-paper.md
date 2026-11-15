---
title: "The drone take-off conflict term on a 100 m grid: right level, same decisions"
seo_title: "Drone take-off conflicts on paper: a grid formula within 0.7%"
date: 2026-11-14
tags: [research, uav, airspace, geometric-probability]
description: "A 100 m grid formula matches the exact take-off conflict term between delivery-drone operators to 0.7%, fixes the level, and changes no layer split."
---

Earlier today `aerolog-scaling` computed exactly the conflicts that *begin*
inside the separation disc: a delivery drone takes off from its hub, or turns
for home at a customer, right next to another operator's drone. That term
depends only on where the hubs are, where each operator delivers and how fast
its drones fly. It is exact, but in plain Python it takes 38 seconds per
layout, and it needs every operator's destination list.

**The small-R form.** When the separation radius *R* is small compared with
how fast traffic density changes, the time another operator's drones spend
within *R* of a point is π*R*² times their airborne path density there,
divided by their speed. The project's "paper weights" already raster that
density on a 100 m grid to rank which operator pairs conflict. So the
take-off term becomes a lookup: for each hub and each delivery point, read the
other operator's density in that cell.

**On 24 eight-operator layouts over New York** (2014 pickup points standing in
for deliveries, *R* = 50 m, 240 flights an hour), four of seven
pre-registered predictions held:

- the grid term matches the exact one to 0.7% pooled, within 5% in 23 of 24
  layouts, and ranks operator pairs the same way (r ≥ 0.998 in every layout);
- it costs 2.7 s per layout, most of it the rasterisation the paper weights
  already pay for. I had predicted under 1 s, so that one failed;
- added to the paper flux weight, it moves the paper estimate of en-route
  conflicts from 0.93 to 1.01 of the exact estimator (within 5% in 22 of 24);
- it changes **no** altitude-layer split worth mentioning: the take-off term
  falls on operator pairs almost in proportion to their crossing traffic, so
  the split the paper weights picked was already right.

**Where it does not help.** With census-only maps (deliveries spread
uniformly over each service disc), the grid take-off term is only 0.44 of the
exact one. That is the same factor-of-two shortfall the census flux term has.
Uniform discs spread out demand that real deliveries concentrate. Adding the
term changed one census split out of 24, for the worse. For a planner without
destination data, the gain still has to come from better demand maps (an
earlier step found residents plus jobs works best), not from more terms.

The model has straight legs, Poisson launches, no avoidance and no wind. It
uses one city, one grid and one radius. Code, tests and results:
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md),
milestone 11u.
