---
title: "What will this house cost to heat, gas furnace against heat pump?"
date: 2026-11-01
tags: [wall-framing-takeoff, energy, construction]
description: The framing takeoff turns its seasonal heat-loss figure into a yearly fuel quantity and cost for each heating system you type, with no prices or efficiencies shipped.
---

The takeoff already derives wall, window, door, ceiling, slab-edge and air-leakage conductance from the framing it placed, and a seasonal kBTU from typed heating degree-days. A buyer or builder's next question is money.

`assembly.heatingSystems: [{name, efficiency, unitBtu, pricePerUnit}]` now turns that seasonal figure into fuel and cost per system: units = kBTU x 1000 / (efficiency x BTU per unit), cost = units x price. Efficiency is AFUE as a fraction or a heat pump's seasonal COP; `unitBtu` is 100,000 for a therm, 3,412 for a kWh.

Hand-checked in `insulation.test.mjs` with a 95% furnace at 1.50 a therm and a COP-3 heat pump at 0.15 a kWh. Nothing is shipped: no fuel prices, no efficiencies, and degree-days must be typed, so with none there is no cost line. Conduction and typed air leakage only, not a Manual J load or an energy-code check.
