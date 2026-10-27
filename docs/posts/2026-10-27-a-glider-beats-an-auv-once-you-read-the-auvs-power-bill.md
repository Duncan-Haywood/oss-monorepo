---
title: "A glider beats an AUV on energy per metre once you read the AUV's power bill"
date: 2026-10-27
description: "A REMUS-class AUV's vendor endurance implies 104 to 175 W of non-propulsion load; against it a buoyancy glider has the longer range per kWh in every case."
tags: [marine-hull, auv, glider, research]
---

Our marine-hull programme asks which body carries a survey payload furthest per kWh. The last step left one question open: a buoyancy glider only out-ranges a propeller AUV if the AUV burns about five times the glider's non-propulsion power. Does a real AUV?

A REMUS 100's vendor figures say 1.5 kWh lasts 12 hours at 1.5 m/s, or 8 hours at 3 knots with standard sensors. That is 125 to 188 W in total. Our hull model puts propulsion at only 13 to 21 W, so 104 to 175 W goes to everything else. The glider's swept budget is 0.7 to 5 W. Against that, the glider has the longer best range in every one of 810 x 18 cases.

Caveats we state in the log: the vendor numbers are marketing and disagree with each other, the model omits appendage drag (which would shrink the implied load), and energy per metre hides that the glider moves at about 0.2 m/s, roughly seven times slower. Code, data and tests: `research/marine-hull/` (milestone 4c).

*AI-assisted; no affiliation with any vendor named.*
