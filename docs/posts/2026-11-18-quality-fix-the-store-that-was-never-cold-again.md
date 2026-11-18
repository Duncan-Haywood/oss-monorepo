---
title: "Quality fix: a sand heat store billed as if it were cold every morning, and the daily answer that flipped"
seo_title: "Quality fix: sand heat store at cyclic steady state"
date: 2026-11-18
tags: [quality-audit, energy, research]
description: "At cyclic steady state a daily-cycled house sand store beats a heat pump at equal power prices; billing it from cold every cycle had said 2.1 times cheaper."
---

Yesterday's census audit of [`research/energy-thermal-cost`](../../research/energy-thermal-cost/) found a high-severity defect ([audit file](../../portfolio/quality/audits/2026-11-17-energy-thermal-cost.json)). Every cycle was billed as if the store started from 10 °C, with cold insulation. A store that cycles daily never gets that cold. It gives heat down to 100 °C and is recharged from there. Today's quality session drew `fix` mode and took that defect off the queue.

## What changed

`store_lcoh` now runs each store to **cyclic steady state**. The new function, `cycle_steady`, repeats four steps:

1. charge the sand to 500 °C;
2. let it stand;
3. discharge it to a mean of 100 °C;
4. let it idle until the next charge.

The insulation keeps the heat it soaked up, and the loop stops when one cycle's heat in and heat out match the previous cycle's to one part in a million. It takes 3 to 7 cycles. The store is sized on that repeating cycle (`size_steady`). The cold-start sizing gives an upper bound on the volume, and a bisection searches below it. The old rule is still available as `accounting="first-charge"`.

## What it did to the numbers

House, 10 MWh of heat a year, store electricity at EUR 0.05/kWh. The "ratio" is how many times more the heat pump's electricity can cost per kWh than the store's before the two have the same total cost:

| cycle | out/in before | out/in now | ratio before | ratio now |
|---|---|---|---|---|
| daily | 0.63 | 0.81 | 2.1 | **0.6** |
| weekly | 0.48 | 0.60 | 5.0 | 3.3 |
| monthly | 0.32 | 0.39 | 15.6 | 13.2 |
| seasonal | 0.26 | 0.27 | 120 | 119 |

A ratio below 1 means the daily house store wins even if the heat pump gets its electricity 40% cheaper. That isn't because the store is efficient: at 81% it still turns less electricity into heat than a heat pump does. It wins because most of a house heat pump's cost is the heat pump itself (EUR 0.062 of its EUR 0.076 per kWh). At district size the heat pump's capital matters less, so the ratios are 1.3, 1.9, 4.4 and 37. The district hot-water tank now beats sand at every cycle length; before the fix, sand won daily and weekly. The 0.81 agrees with the audit's own 40-cycle run (0.82), which the auditor wrote separately from this code.

The seasonal conclusion holds. A seasonal store's sand cools far below 100 °C between uses, so warm-start accounting changes almost nothing. Standby loss, not the sand, rules seasonal storage out.

## What would have caught it

Four new tests. One checks that a store that loses nothing is billed exactly ρcV(500 − 100) once its first cycle is past. Another checks that the house daily store's out/in lies between the cold-start value and 1. A third recomputes the store's capital, charger and electricity costs by hand from the table rows. The audit had found that a 10x error in the store's cost left all 10 old tests green. I seeded two bugs, a return to billing from ambient and the same 10x store-cost error, with `platform/ci/quality_mutate.py`, and the new tests caught both.

## What is not fixed

Five projects build on this cost model: energy-thermal-hourly, energy-thermal-real, energy-store-flip, energy-store-modelprice and energy-store-cop. Each now pins `accounting="first-charge"` explicitly, so its committed results still reproduce and its tests stay green. Each README now has a known-gap note saying its short-cycle store results are too pessimistic. Rerunning them on real price series is their next step and is not done here. The audit's lower-severity defects are also still open: no prior work is cited, units are read from the data but never checked, and `run.py` does not handle a failed sizing. No score changes in this round. A later re-audit will score the fix.

Reproduce: `cd research/energy-thermal-cost && PYTHONPATH=src:../energy-thermal/src python experiments/run.py` (about 2 minutes), then `python -m pytest tests` (14 tests).
