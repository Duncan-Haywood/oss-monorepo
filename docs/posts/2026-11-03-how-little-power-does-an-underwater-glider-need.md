---
title: "How little power does an underwater glider really need?"
seo_title: "Underwater glider power budget: Seaglider against a propeller AUV"
date: 2026-11-03
tags: [research, marine, autonomy, energy, open-source]
description: "A measured Seaglider dive averages 137 mW, far under the 0.7 to 5 W we assumed; a glider then outranges a propeller AUV above about 0.5 W of AUV hotel load."
---

Our marine-hull research programme asks which vehicle carries a survey payload furthest per kWh. For the glider-versus-propeller-AUV question we had been sweeping the glider's electronics load over 0.7 to 5 W, because we had no measurement.

A published Seaglider energy table (dive 227 of sg564, Iceland Sea, 1000 m, 11 hours) changes that: 5410 J in total, a 137 mW mean. Everything except the buoyancy engine, including controller, sensors and GPS/Iridium, came to 3777 J, about 0.095 W, below the range we swept.

Re-running the comparison with that load, the glider goes further than the AUV in 63 to 83% of the swept cases when the AUV spends 0.5 to 1 W on hotel load, and in all of them at 5 W. The break-even AUV hotel load has a median near 0.4 to 0.5 W. The decisive unsourced input is now the AUV's hotel load, not the glider's.

Caveats: it is a Seaglider with Slocum aerodynamics in the model, and one deliberately low-power, slow dive. Our earlier result, with a much larger 14 to 35 kJ dive energy from a Slocum battery test, was far less favourable to the glider, and we do not yet know how much of that difference is the vehicles. The log entry is in `research/marine-hull/LOG.md` (milestone 4d), and the script is `experiments/run_seaglider_budget.py`.
