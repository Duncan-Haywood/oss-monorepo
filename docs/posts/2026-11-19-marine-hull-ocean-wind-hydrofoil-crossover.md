---
title: "Real ocean wind hurts a slow survey boat most, yet moves the hydrofoil crossover up, not down"
seo_title: "Survey boat range in real ocean wind: hydrofoil vs monohull"
date: 2026-11-19
tags: [research, marine-hull]
description: "Air drag averaged over 84,776 NDBC buoy winds costs a slow monohull up to 8% of its range, yet the hydrofoil crossover rises from 818 W to 841 W."
---

The [previous step](2026-11-19-marine-hull-air-drag-hydrofoil-crossover.md) of the [marine-hull programme](../../research/marine-hull/README.md) gave every hull in the model air drag, and found the hydrofoil overtaking a plain monohull at 659 to 818 W of payload power, depending on the drag area. It did that in still air. At sea the boat meets real wind from every direction, and that changes the physics for a slow boat.

In still air the drag goes as speed squared, which is tiny at the 1 m/s a survey monohull cruises at. In a wind w met from every heading, the average air force along the track goes roughly as **1.5 × boat speed × wind speed** once the wind is much faster than the boat. That is linear in the boat's speed, not squared. So I expected real wind to cost the slow monohull more, in proportion, than the fast hydrofoil, and to pull the crossover down. I wrote that expectation, and six others, into the log before running anything.

The wind came from data already in the repository: **84,776 ten-minute records from 11 NOAA buoys** (January and July 2024, mean 5.7 m/s). The air force was averaged over 72 headings and that whole wind distribution; everything else is the previous step unchanged.

| drag area CdA | monohull 30 W range, wind vs still air | hydrofoil overtakes at, still air | in measured wind |
|---|---|---|---|
| 0.1 m² | −2.2% | 700 W | 706 W |
| 0.2 m² | −4.3% | 739 W | 751 W |
| 0.4 m² | −8.2% | 818 W | 841 W |

- **Half the expectation held.** Wind does hit the slow monohull hardest: at a 30 W payload it loses 2% to 8% of its range, more than any other hull, and at 1 m/s the average air force is 8.6 times the still-air one.
- **The other half failed.** The crossover moves **up**, by 1% to 3%. At the payload where the hydrofoil catches up, the monohull is no longer slow (2.3 m/s, near its wave-making hump, with 38 N of water drag), while the foil flies its whole hull through the air at 10.5 m/s. There, wind adds 0.5% to the monohull's energy per metre and 1.0% to the foil's.
- **The headline survives.** The monohull still goes furthest for every payload up to 200 W, in all 972 hydrofoil designs, with winds cut to a 1 m height or raised by half (874 W crossover at the worst). Buoy by buoy, the crossover only spans 701 to 711 W.
- **Changing speed with the wind buys nothing here**, because the model's monohull sits in a hollow of its wave-resistance curve at 1.00 m/s and the wind is not enough to move it to the next one. Thin-ship theory makes those hollows sharper than real hulls do, so I'd not quote that as a property of boats.

Still missing: waves. Wind and waves arrive together, and added resistance in waves is the larger term this model leaves out. The NOAA wave records are already in the repository, so that is the next step.

Code, results and figure: [`run_wind_air_drag.py`](../../research/marine-hull/experiments/run_wind_air_drag.py), [`results_wind_air_drag.txt`](../../research/marine-hull/experiments/results_wind_air_drag.txt), [`wind_air_drag.svg`](../../research/marine-hull/experiments/wind_air_drag.svg); the pre-registered plan and outcome are in the [research log](../../research/marine-hull/LOG.md).
