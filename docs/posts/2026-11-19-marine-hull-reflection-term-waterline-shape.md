---
title: "The ITTC wave formula's reflection term treats a fine bow as blunt: tank data say the waterline shape matters"
seo_title: "STAWAVE-2 reflection term vs waterline shape on Wigley tank data"
date: 2026-11-19
tags: [research, marine-hull]
description: "Faltinsen's waterline formula in place of STAWAVE-2's reflection term moves held-out Wigley tank error from +13% to -7%, and a 4 m boat's wave loss to 3.4%."
---

The previous [marine-hull](../../research/marine-hull/README.md) step fitted heave and pitch damping to a towing tank's measured motions and held out the measured added resistance. Heave and pitch then matched the tank about as well as the published methods do. The predicted added resistance still came out 13% above the measurement over the whole wavelength range. If the motions are right, the extra 13% has to come from the added-resistance formula.

The added resistance here has two parts. Strip theory gives the part caused by the hull moving (the radiated-energy term). The ITTC's STAWAVE-2 procedure supplies the part caused by short waves bouncing off the bow (the reflection term). That second term is half of rho g times the wave amplitude squared times the **beam**, scaled by a draft factor and a speed factor. The bow's shape enters only through the block coefficient. On a fine Wigley bow, whose waterline meets the waves at a shallow angle, that is a lot of reflection. In the shortest waves the tank measured, STAWAVE-2's term alone came out about twice the whole measured resistance.

Faltinsen and co-authors (1980) give a short-wave formula that reads the bow shape directly. It integrates sin²θ along the part of the waterline the waves hit, where θ is the waterline's angle to the hull's long axis. A transverse wall gets the full beam. On Kashiwagi's slender tank hull the integral is **5.2% of the beam**, and on our 4 m survey monohull (length/beam 10) it is 1.9%. We added it as a [small module](../../research/marine-hull/src/marine_hull/reflection.py), checked it against the closed form for a parabolic waterline (to 3 parts in 10⁸) and against the wall limit. Seven expectations went into the [log](../../research/marine-hull/LOG.md) before the run.

What changed, with the damping fitted to the motions in the previous step and nothing fitted to the added resistance:

| Tank hull, λ/L 0.3 to 2.0 | area / measured | short waves (0.3 to 0.6) | rms error |
|---|---|---|---|
| strip theory alone | 0.905 | 0.27 | 1.33 |
| + STAWAVE-2 reflection | 1.134 | 2.08 | 1.56 |
| + waterline (Faltinsen) reflection | **0.929** | 0.58 | **1.29** |

The 13% excess becomes a 7% deficit, and the error against the measured curve drops. The result is not sensitive to the details we couldn't settle from the sources at hand. Using k T or 1.5 k T in the draft factor, and keeping or dropping the speed factor, gives area ratios from 0.915 to 0.949. In the shortest waves the new term is too small rather than too large: the tank measures a flat sigma of about 1.1 at λ/L 0.3 to 0.6, and strip theory plus the waterline term gives 0.5 to 0.8. Fine bows are a known weak spot of the asymptotic formula. We did not fit a correction for it.

On the 4 m monohull the reflection term at 1 m/s drops from 0.73 N to 0.03 N, and the motion term (2.84 N) is unchanged. The 30 W bow-sector range loss goes from 4.18% to **3.39%** (3.38% to 3.43% over the variants). The tank data now bracket the estimate from both sides: 4.2% with STAWAVE-2's term (tank area 1.13) and 3.4% with the waterline term (tank area 0.93). The best estimate narrows from "3.7% to 4.2%" to **3.4% to 4.2%**. The hull ranking and the 200 W crossover hold in every case.

Limits. There is one tank hull at one speed, and the data points are read from a secondary source's figures. The formula is an asymptote for short waves on wall-sided hulls. We have not opened the 1980 proceedings, so the formula is taken as later papers reproduce it. The monohull's length/beam of 10 is still outside any tank data we have. Results: [`results_faltinsen_reflection.txt`](../../research/marine-hull/experiments/results_faltinsen_reflection.txt), from [`run_faltinsen_reflection.py`](../../research/marine-hull/experiments/run_faltinsen_reflection.py) (3 minutes, standard library only).
