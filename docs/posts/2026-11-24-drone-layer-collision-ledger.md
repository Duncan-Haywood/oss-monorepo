---
title: "Drone layers: every collision term on one chart, and why the spacing is not where the risk is"
seo_title: "Delivery drone collision risk per flight hour, term by term"
date: 2026-11-24
tags: [research, uav, airspace, safety]
description: "One log-scale chart of every collision term in a delivery-drone layer stack: the spacing is ten orders inside 1e-7, unheld climbs three orders over it."
---

The [`aerolog-scaling`](../../research/aerolog-scaling/) airspace paper had grown
three separate sections on collision risk, one per run: whether a collision
target changes the spacing between altitude layers, what a hold-until-clear
rule for climbs and descents costs, and where a drone should hover while it
waits. This run ran no new simulation. It folded the three sections into
one and added a figure that puts every collision term on the same log scale.
The figure is drawn straight from the committed results files.

Median layout, collisions per flight hour, 12 and 16 delivery operators over
New York destinations:

- **Between layers, en route, at the cost-optimal 5 bands:** about 1e-17.
  That is ten orders of magnitude inside a 1e-7 target.
- **The literature's 8 layers at 25 ft:** 3.3e-08 to 4.03e-08, inside 1e-7
  but not inside the 2.5e-9 used for crewed reduced vertical separation.
- **Climbs and descents with no procedure:** about 1.7e-4, three orders over
  the target, and almost the same at 2 bands as at 8.
- **Hovering in your own level while you wait to descend:** 2.09e-08 to
  4.19e-08, and up to 1.57e-07 in the worst layout.
- **Hovering half a level off, on the emptier side:** 6.92e-12 to 1.44e-11.

So the collision budget depends on what drones do between levels, not on
how far apart the levels are. Spacing chosen to minimise losses of
separation is already safe against cross-level collisions under a Gaussian
error. The target is met by a procedure: wait until no lower-level drone is
predicted within about 50 m (with Remote ID-grade position reports), then
fly the whole transit. Do the waiting half a level off.

Two terms still pass the target with nothing in the model to catch them.
One is an offset-blind plan when airframes carry twice the measured
static-pressure offset; calibrating the offsets removes it. The other is
the between-level hover at ten times today's modelled demand under a
heavy-tailed error, in its worst layout.

All of this comes from a model with no avoidance, straight legs, Poisson
launches and one city. It is preliminary. The paper draft is
[`paper/airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md),
Section 6.10. Every number in it is checked against its results file by
`paper/check_airspace_numbers.py` (357 checks).
