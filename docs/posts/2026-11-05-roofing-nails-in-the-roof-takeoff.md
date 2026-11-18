---
title: "Roofing nails now count in the roof takeoff"
seo_title: "Roofing nails per square: pounds and boxes to order for a roof"
date: 2026-11-05
tags: [wall-framing-takeoff, roofing, construction]
description: "The roof takeoff now counts roofing nails in pounds and boxes, for gable, hip and cross-wing roofs, and prices them in the budget."
---

A roof order that lists shingles, felt, drip edge, starter and ridge cap but not nails is a trip back to the supplier. The roof takeoff in wall-framing-takeoff now counts the nails for the shingle field.

The sum is plain: squares, times the waste factor, times nails per square, divided by nails per pound, divided by the box weight. Defaults are 320 nails per square (four per shingle on about 80 shingles), 150 nails per pound and 30 lb boxes. All three are typed in `roofing` (`nailsPerSquare`, `nailsPerLb`, `nailBoxLb`) so you can match your shingle maker's nailing pattern and your supplier's pack. Gable, hip and cross-wing roofs all report `nails`, `nailLb` and `nailBoxes`; the text report shows the pounds, and the budget lists "Roofing nail boxes" under the price key `roofingNailBox`.

Honest limits: the defaults are typical figures, not a manufacturer's schedule, and the tests are hand sums. Starter, ridge cap, underlayment and cap-nail fasteners are not counted, and steep or high-wind roofs may need six nails per shingle, so type your own number. The code is MIT licensed in `ventures/wall-framing-takeoff`.
