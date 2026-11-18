---
title: "Ice and water shield now counts in the roof takeoff"
seo_title: "Ice and water shield rolls for roof eaves: how many to order"
date: 2026-11-05
tags: [wall-framing-takeoff, roofing, construction]
description: "The roof takeoff can now count rolls of ice and water shield along the eaves, from the overhang plus the inches inside the wall, and prices them in the budget."
---

In cold climates the first few feet of roof above the eave get a self-sealing membrane under the shingles, to stop ice dams pushing water under the courses. A roof order that leaves it out is another trip to the supplier. The roof takeoff in wall-framing-takeoff can now count it.

It is opt-in: set `roofing.iceShield` to the inches the membrane runs inside the exterior wall (24 is the figure codes commonly use). The depth up the slope is the overhang plus that, times the slope factor, and the area is the eave length times that depth. Rolls come from `iceShieldRoll` (default 200 sq ft, a 36 in x 66 ft roll) and `iceShieldWaste` (default 1.1 for side laps). Gable, hip and cross-wing roofs report `iceShieldArea` and `iceShieldRolls`; the budget lists "Ice and water shield rolls" under the price key `iceShieldRoll`.

Limits: rakes, valleys and penetrations are not counted, a wing uses the main roof's overhang and pitch, and whether your jurisdiction requires it is yours to check. The tests are hand sums. The code is MIT licensed in `ventures/wall-framing-takeoff`.
