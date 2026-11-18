---
title: "A tight house still needs fresh air: adding ventilation to the framing takeoff's heat loss"
seo_title: "ASHRAE 62.2 ventilation load in a wall heat-loss estimate"
date: 2026-11-06
tags: [wall-framing-takeoff, construction, energy]
description: "The wall-framing takeoff now adds the ASHRAE 62.2 ventilation load, with an optional heat-recovery credit, to its envelope heat loss."
---

The wall-framing takeoff already turns a framing plan into heat loss: walls, windows, doors, slab edge, ceiling and air leakage. Its report ended with "mechanical ventilation is not in it", which understates a tight house, where fresh air is a large share of the load.

It now takes two numbers, conditioned floor area and bedrooms, and applies the ASHRAE 62.2 whole-house rate, 0.03 x floor area + 7.5 x (bedrooms + 1) cfm. The sensible load is 1.08 x cfm per degree F, reduced by a typed heat-recovery effectiveness if you have one.

By hand: 2,000 sq ft and 3 bedrooms is 60 + 30 = 90 cfm, or 97.2 BTU/h per F. A 75% recovery ventilator cuts that to 24.3. The tests check these figures, and partial input is refused. It is an engine and plan-file option only, with no page field yet, and it has not been checked against a real house. Typed rates other than 62.2 are not read.
