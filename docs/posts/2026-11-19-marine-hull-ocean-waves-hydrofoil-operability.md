---
title: "Real ocean waves cost a small survey monohull 2.5% of its range, and ground a small hydrofoil most of the time"
seo_title: "Survey boat range in real ocean waves: monohull vs hydrofoil"
date: 2026-11-19
tags: [research, marine-hull]
description: "ITTC STAWAVE-2 over 14,758 NDBC sea states: a 4 m monohull loses 2.5 to 9.4% of its range; a 0.3 m-strut hydrofoil could fly in 2.4% of hours."
---

The [previous step](2026-11-19-marine-hull-ocean-wind-hydrofoil-crossover.md) of the [marine-hull programme](../../research/marine-hull/README.md) gave every hull real ocean wind and found the hydrofoil overtaking a plain monohull at 700 to 841 W of payload power. It ended by naming the bigger missing term: waves. This step adds them.

**Method.** The added resistance comes from the ITTC's STAWAVE-2 method, the empirical transfer function the International Towing Tank Conference prescribes for correcting ship speed trials (Recommended Procedure 7.5-04-01-01.1, 2021, Annex G.2). It has a motion term and a wave-reflection term, and I integrated it over the ITTC 1978 wave spectrum of every one of **14,758 hourly sea states from 11 NOAA buoys** (January and July 2024, mean significant wave height 1.44 m). Those records were already in the repository. The ITTC procedure only counts waves within 45 degrees of the bow, so a survey boat running lines on every heading pays a quarter of the head-sea figure. Every wave met head-on is the upper bound. Eight expectations went into the log before the run, and all eight held.

| | calm water | waves, ITTC bow sector | every wave head-on |
|---|---|---|---|
| monohull range, 30 W payload | 823.7 km | 802.9 km (−2.5%) | 746.5 km (−9.4%) |
| hydrofoil overtakes the monohull at | 659 W | 651 W | 627 W |

- **The ranking holds.** Even if the hydrofoil paid nothing at all in waves, which flatters it, the monohull still goes furthest for every payload up to 200 W, in all 972 hydrofoil designs. The crossover moves by 1 to 5%: where the hydrofoil catches up, the monohull already runs at 2.3 m/s, and there its calm-water drag dwarfs the wave term.
- **Waves hurt the slow end most, the same as wind did.** The monohull loses 5.1% of its range at a 1 W payload, 2.4% at 30 W and 0.5% at 1 kW. An added force that barely depends on speed matters most when the propeller's share of the energy is small. Its best speed stays at 1.00 m/s.
- **Whether the hydrofoil can fly is the bigger question.** Only **2.4% of the hours** had waves no higher than the foil's 0.3 m strut, 12% had waves under 0.5 m and 37% under 1 m. At the four Pacific buoys, waves were under 1 m in at most 23% of hours in either month. Sheltered summer water in the Gulf of Mexico and Gulf of Maine is the exception, at 92 to 100%. So outside calm summer water, any range figure for a small hydrofoil describes a boat that would spend most of its time hull-down in the water.
- **Waves and wind together** cost the monohull 4.9% of its 30 W range from calm water.

**The caveat is large.** STAWAVE-2 was fitted to ships 50 to 400 m long. These hulls are 4 m long, and their beam-to-draught ratio of 1.5 is below the method's 2.2 floor, so every number here is an extrapolation of a dimensionless fit. The next step checks it at this scale with a seakeeping (strip-theory) calculation, and looks for a sourced sea-state limit for small fully submerged foils.

Code, results and figure: [`run_wave_added_resistance.py`](../../research/marine-hull/experiments/run_wave_added_resistance.py), [`waves.py`](../../research/marine-hull/src/marine_hull/waves.py), [`results_wave_added_resistance.txt`](../../research/marine-hull/experiments/results_wave_added_resistance.txt), [`wave_added_resistance.svg`](../../research/marine-hull/experiments/wave_added_resistance.svg). The pre-registered plan and outcome are in the [research log](../../research/marine-hull/LOG.md).
