---
title: "Why a hydrofoil survey boat gets a seventh of a monohull's range: the speed it is forced to fly at"
seo_title: "Survey boat range vs speed: monohull, catamaran, SWATH, foil, planing"
date: 2026-11-18
tags: [research, marine-hull]
description: "Range against speed for five small survey-boat hull types on one 10 kWh basis: the monohull peaks at 824 km near 1 m/s, the foil cannot fly below 9 m/s."
---

The [marine-hull programme](../../research/marine-hull/README.md) asks which body carries a small survey payload furthest per kilowatt-hour. Its sweeps already gave the answer as a table: across thousands of cases the plain displacement monohull wins, the catamaran almost never beats it at equal length, and SWATH, planing and hydrofoil craft never do. A table of win counts does not show *why*. So this step drew the figure a reviewer would ask for first: range against speed, one curve per hull type.

Each curve uses the resistance model its own milestone used, evaluated at the middle of that milestone's swept box. Every craft is 200 kg with a 10 kWh battery and a 30 W payload. Nothing new was swept; the script runs in about a second.

## Where each curve peaks

| Hull type | Best range | At speed | Share of the monohull's range |
|---|---|---|---|
| Monohull (4 m Wigley) | 823.7 km | 1.00 m/s | 1.000 |
| Catamaran (two 4 m demi-hulls) | 713.1 km | 0.90 m/s | 0.866 |
| SWATH (two torpedoes on struts) | 546.1 km | 0.70 m/s | 0.663 |
| Hydrofoil, foilborne | 116.4 km | 10.25 m/s | 0.141 |
| Planing hull | 80.3 km | 3.25 m/s | 0.097 |

The three displacement hulls peak at 0.7 to 1.0 m/s, about walking pace. The reason is the payload: at the best speed of a drag force rising as speed squared, propulsion takes about a third of the power and the payload the rest, so a 30 W payload pins the best speed near 1 m/s. The catamaran and SWATH lose because they carry more wetted surface, and friction on that surface is most of the drag at walking pace.

The fast craft lose for a different reason. The central hydrofoil cannot lift the boat at all below 9 m/s, so it has to run at ten times the speed where range is best, and drag at that speed swamps the payload. The planing hull has the same problem at a lower speed. Neither is a bad design for its own job; survey endurance is not that job.

I had written down three expectations before running it. The peaks did fall in the table's order, and the best speed did rise roughly as the cube root of the payload power. The third failed: I expected every displacement peak between 0.8 and 1.5 m/s, and SWATH peaks lower, at 0.70, because its extra wetted area makes friction dominate further down the speed range.

## The payload sets the speed

The figure's second panel keeps the monohull and changes only the payload's power draw. From 5 W to 120 W the best speed rises from 0.60 to 1.65 m/s, and range falls from 2,670 km to 323 km. On a log-log plot the slope is 0.32, close to the one third the cube law predicts. That is the paper's practical message in one picture: before you choose a hull, measure what the payload draws.

## Limits

These are single central cases, so they illustrate the sweeps rather than replace them. The water is calm. The hull constants are the same unsourced, swept ones as the main results, checked so far against one Wigley tank point and a set of yacht hulls. The planing peak sits near the lowest speed where the Savitsky method applies, so treat that number as a rough upper figure.

The data is in [`results_range_speed.txt`](../../research/marine-hull/experiments/results_range_speed.txt), the script is [`run_range_speed.py`](../../research/marine-hull/experiments/run_range_speed.py), and the figure now sits in the [paper draft](../../research/marine-hull/paper/main.tex), with each quoted number checked against the file by `check_numbers.py`.
