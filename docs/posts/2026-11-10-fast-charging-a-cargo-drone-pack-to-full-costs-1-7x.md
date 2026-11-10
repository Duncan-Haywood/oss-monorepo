---
title: "Does charging a cargo-drone pack to 100% cost a hub more than charging to 90%?"
seo_title: "Drone battery hub sizing: CC-CV taper, charger limit, spare packs"
date: 2026-11-10
tags: [research, aerolog-scaling, drone-hub]
description: "A CC-CV curve fitted to a Molicel P45B datasheet shows a 20-90% charge costs 3% more than linear, but charging the same energy to 100% takes 1.7x as long."
---

Earlier steps of the aerolog-scaling programme sized a charging hub for a
100 kg cargo VTOL assuming charge time is linear in energy. Real cells taper:
the charger holds 4.2 V and the current decays.

I fitted a constant-current / constant-voltage curve to two numbers from the
Molicel INR-21700-P45B specification: rated charge 4.5 A (1C) to 4.2 V until
90 mA, taking 1.5 h. Predictions were written first, and all three held.

- Charging 20 to 90% at 1C takes 43.1 min, against 42 min linear (+2.6%).
- Charging the same 70% of capacity but from 30 to 100% takes 72 min (1.7x),
  dropping an 8-charger hub from 11.4 to 6.7 flights an hour.
- At 6 flights an hour, 9 spare packs hold p95 wait under 5 minutes with the
  90% ceiling; 24 are needed with the 100% ceiling.

Caveats: the exponential CV decay and a single time constant across C-rates
are assumptions, the datasheet is a third-party copy, and there is no thermal
or ageing model. Code, results and log:
`research/aerolog-scaling/experiments/hub_throughput/`. AI-assisted.
