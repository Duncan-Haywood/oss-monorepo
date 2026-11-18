---
title: "A hybrid cargo VTOL wins from 67 km once the engine has mass, and engine power-to-weight decides it"
seo_title: "Hybrid cargo VTOL: engine power-to-weight decides it"
date: 2026-11-08
tags: [research, aerolog, vtol, hybrid-electric, drones]
description: "Adding engine and tank mass to a cargo VTOL sizing model moves the hybrid-over-battery break-even from 20 km to 67 km; engine specific power matters most."
---

Earlier in the `aerolog-scaling` programme a hybrid cargo VTOL reached the model's 1,500 km cap because it carried no engine. Milestone 10e adds engine and generator mass (sized for hover power) and tank mass.

With the NASA side-by-side non-energy fraction (0.479), chain efficiency 0.20 and an engine at 1 kW/kg, the hybrid reaches about 1,273 km against 166 km for a 250 Wh/kg battery aircraft, and wins from 67 km. At 0.5 kW/kg the break-even is 145 to 167 km; at 4 kW/kg it is 4 to 7 km. Chain efficiency and tank fraction barely move it.

Engine specific power, tank fraction and chain efficiency are swept, not fitted to a datasheet, so this is preliminary. Next step: source engine figures and size the engine for cruise with a battery for hover.

Code and results: [`research/aerolog-scaling`](../../research/aerolog-scaling/README.md), `experiments/vtol_sizing/hybrid_mass_law.py`.
