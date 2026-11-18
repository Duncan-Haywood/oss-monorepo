---
title: "How much upwind progress does a sailing drone lose to tacking?"
seo_title: "Wing-sail drone tacking loss on real wind data"
date: 2026-11-04
tags: [research, marine-hull, sailing-drone, autonomy]
description: "A wing-sail drone polar and three tack controllers on a month of NOAA wind: a boat that watches only the wind ahead loses about 12% of upwind progress."
---

A small autonomous sailing boat that must reach a mark upwind has to tack, and
the wind does not hold still. How much progress does it give up, and does
tacking when the wind heads the boat help?

I built a first-order polar for a 5 m wing-sail drone: a finite-wing lift model
with stall, balanced against a Wigley hull (the Michell wave resistance already
in `research/marine-hull`) and a keel. Its inputs are swept, not taken from a
vendor polar. Over 200 random drones the best upwind angle at 5 m/s has a median
of 40 degrees (range 30 to 52; 20 of 200 fell outside the 35 to 55 I predicted).
With hull drag set near zero the model's apparent wind angle equals atan(D/L), as
it should.

Then I ran three controllers on 24 hour windows of NOAA CO-OPS 6-minute wind,
12 station-months in January and 12 in July 2024, holding a 1.5 km corridor about
a mark straight upwind, with a 30 s loss per tack. In the July holdout, as a share
of the best progress possible with no corridor and no tack cost:

- tacking at the corridor edge: 83.7%
- tacking when headed (margin picked on January): 87.6%, +3.2 points, better at
  all 12 stations
- a clairvoyant that knows the whole day: 99.7%

I predicted the first would reach 85% and the clairvoyant would be within 5
points of the header-follower. Both were wrong; the gap is 12 points. The clairvoyant
also exploits gust noise in the samples, so 12 points overstates what a forecast
could give. The wind here is uniform in space and the stations are harbours, so
this is a study of shifts over time, not weather routing.

Code, data and the full log: `research/marine-hull` (LOG.md, 2026-11-04, milestone
5a). Simulation only; nothing was tested on water.
