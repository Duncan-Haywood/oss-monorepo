---
title: "Does air drag change when a hydrofoil out-ranges a monohull? It moves 659 W to 818 W"
seo_title: "Hydrofoil vs monohull range with air drag: the payload crossover"
date: 2026-11-19
tags: [research, marine-hull]
description: "Adding still-air drag to a 200 kg survey boat model: the monohull still leads to 200 W of payload; the hydrofoil crossover rises from 659 W to 818 W."
---

Yesterday's step of the [marine-hull programme](../../research/marine-hull/README.md) found that a plain displacement monohull gives a 200 kg autonomous survey boat the longest range for any payload drawing up to 200 W, and that a hydrofoil overtakes it once the payload draws about 659 W. That crossover had a hole in it: no rung of the model had any air drag. A foilborne boat flies its whole hull through the air at 10 to 16 m/s, and a planing hull's best speed in that run sat at 38.75 m/s, where air drag is anything but small.

So this step added it. Every rung now carries a still-air drag of one half times air density (1.225 kg/m³, the ISO standard sea-level atmosphere) times a drag area CdA times speed squared. Nobody has measured the drag area of these notional craft, so CdA was swept from 0 to 0.4 m², which spans a faired small hull to a bluff one carrying a sensor mast (drag coefficients of about 0.3 to 1.2 from Hoerner's handbook, on frontal areas of 0.06 to 0.4 m² that I estimated for a 4 m, 0.4 m-beam hull). The plan and five expectations went into the log before the run.

What came out (2 seconds, standard library only):

| CdA (m²) | hydrofoil overtakes at | 972 foil designs, median | planing overtakes at | planing best speed at 10 kW |
|---|---|---|---|---|
| 0 | 659 W | 881 W | 1,068 W | 38.75 m/s |
| 0.1 | 700 W | 935 W | 1,214 W | 38.25 m/s |
| 0.2 | 739 W | 981 W | 1,362 W | 29.25 m/s |
| 0.4 | 818 W | 1,063 W | 1,744 W | 23.50 m/s |

- **The 200 W scope holds.** At every drag area, the monohull goes furthest at every payload load up to 200 W, both in the central case and in all 972 hydrofoil designs of the swept box. No payload this programme has sourced (8 to 175 W) is near the crossover.
- **The crossover moves up by at most a quarter.** The paper's "659 W" becomes "659 to 818 W over CdA 0 to 0.4 m²". The displacement rungs barely notice the air (under 1% at 30 W). The hydrofoil does notice it, its 30 W range ratio falling 13% at the largest drag area.
- **One expectation failed.** I expected a modest drag area (0.1 m²) to pull the planing hull's best speed below 25 m/s. It doesn't: it stays at 38.25 m/s until CdA is about 0.2 m². So the planing crossover is still a grid-ceiling artefact for a clean hull, and the hydrofoil number is still the one to quote.

What this does not cover: wind (a headwind raises the air speed the foil sees, so a wind-speed sweep comes next), spray drag, and waves. At 10 kW the monohull itself sits at its 6 m/s grid ceiling, far outside the regime where its resistance model has been checked, so the high-load ratios are statements about the model and not about real boats.

Code, results and figure: [`run_air_drag.py`](../../research/marine-hull/experiments/run_air_drag.py), [`results_air_drag.txt`](../../research/marine-hull/experiments/results_air_drag.txt), [`air_drag.svg`](../../research/marine-hull/experiments/air_drag.svg); the full entry is in the [research log](../../research/marine-hull/LOG.md).
