---
title: "Which battery cell decides when a hybrid cargo drone beats a battery one?"
seo_title: "Hybrid vs battery cargo VTOL break-even range by Li-ion cell (Molicel P42A to P50S)"
date: 2026-11-09
tags: [research, aerolog-scaling, uav, hybrid-electric]
description: "In our cargo VTOL sizing model, swapping between four published Molicel 21700 cells moves the range where a hybrid starts to beat a battery aircraft from 44 km to 22 km."
---

Earlier milestones of the aerolog-scaling programme found that one input, the
battery pack's peak power per kilogram, explains most of the variance in the
range at which a hybrid cargo VTOL overtakes a battery one. Those ranges were
my guesses. This run replaced them with numbers from Molicel's published
product pages for four 21700 cells.

At the model's base case (1 kW/kg engine, 100 m climb), the break-even is 44 km
with the P42A (230 Wh/kg, 45 A), 42 km with the P45B, 32 km with the P50B
(60 A) and 22 km with the P50S (100 A). Sampling the other ten inputs over the
earlier ranges gives medians of 42, 40, 30 and 28 km, with overlapping bands.
I predicted every cell would land between 25 and 60 km; the P50S missed by
3 km.

Caveat that matters: the page's current figure is a maximum rating, not a
continuous flight-pack rating, so the P50S result is a lower bound on the
break-even. Datasheet PDFs are behind a form, so the continuous-discharge
curve is the next thing to find.

Code, results and log: `research/aerolog-scaling` (`vtol_sizing/sourced_cells.py`).
