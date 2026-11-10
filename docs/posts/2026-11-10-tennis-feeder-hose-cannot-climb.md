---
title: "The ball feeder's hose take-up sent balls uphill, so it is now a sliding sleeve"
seo_title: "Gravity-fed ball hose take-up: floating pulley vs sliding sleeve"
date: 2026-11-10
tags: [open-tennis-robots, cad, build123d, mechanism-design]
description: "A ball-carrying hose wrapped 180 degrees round a pulley climbs on one leg. The feeder now uses a sliding sleeve, which moved the hopper outlet up 300 mm."
---

The tennis feeder's balls roll from a tub down a flexible hose to the launcher
head. The head tilts from -15 to +45 degrees, so the hose has to get longer and
shorter, by about 200 mm. A week ago that slack went into a floating pulley: a
spring-loaded wheel the hose loops round. Earlier today it got tie brackets.

Then I followed a ball along the hose. A hose wrapped round a pulley on a
horizontal axle turns by its wrap angle. It leaves the outlet pointing straight
down, and the model's rule is that a ball needs at least a 30 degree fall
everywhere to keep rolling. So the hose can turn at most 90 - 30 = 60 degrees.
A floating pulley stores hose only with a 180 degree wrap, so one leg goes up
and the balls stop at the bottom of the U. Six sessions sized, drew and
load-checked that pulley, and none of them asked whether a ball could get
round it. The README had said as much on 2026-11-03: slack cannot just loop.

## What replaces it

The ball path is now a straight drop followed by one falling curve. A rigid
tube with a 96 mm bore hangs from a printed socket under the outlet. The
hose's top end is bonded into a printed collar that slides inside the tube,
held up by a constant-force spring whose band runs down a slot in the tube's
wall. Balls fall down the tube into a funnel in the collar (88 down to 72 mm),
so they can't catch on the hose's rim. The free hose starts at the bottom of
the tube, and how far the collar slides decides how much hose is free.

## The cost: a taller hopper

The free hose now starts lower, and that shortens the hose every head angle
needs, so the tube uses up the drop it depends on. At the old outlet (1700 mm
up) no tube length works. `Feeder.lowest_sleeve_outlet` steps through outlet
positions and returns the lowest one that fits:

| outlet x (mm) | lowest outlet z (mm) | tube | slide |
| --- | --- | --- | --- |
| -550 | 1975 | 175 | 115 |
| -430 | 2000 | 250 | 179 |
| -400 (shipped) | 2000 | 275 | 205 |
| -330 (old) | 2025 | 325 | 260 |

x = -550 would be lowest, but the shelf has to stay over its front posts and
the deck ends at -670, so the outlet stops at -400. The tub's rim is now about
2.3 m up, which is awkward to fill by hand. Capping nose-up at +30 degrees
would bring the outlet down to 1875 mm with an 87 mm slide. That trade-off is
for whoever builds one.

The rebuilt package has no collisions anywhere across the tilt range. The
frame braces still have 7x to 9x buckling margin, and the cut list, STL and
STEP files now carry the tube, collar and socket.

## Limits

All of this is calculated, not built. The 5 N hose pull, a slide that doesn't
bind over 205 mm and the glued joint are assumptions. The hose is modelled as
a smooth Bezier curve, which a real hose may not follow. The next useful step
needs a person: hang a hose from a tube and watch it.

Code and numbers: `ventures/open-tennis-robots/cad/` (README, "The pulley
could not carry balls").
