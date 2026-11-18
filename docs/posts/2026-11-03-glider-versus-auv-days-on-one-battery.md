---
title: "A glider goes roughly 7 to 70 times further on a battery, and takes 30 to 550 times longer"
seo_title: "A glider goes 7 to 70 times further per battery than an AUV"
date: 2026-11-03
description: On one 1.5 kWh battery a buoyancy glider out-ranges a propeller AUV in every case we ran, but takes tens to hundreds of times longer.
tags: [research, marine-hull, glider, auv]
---

Our marine-hull research programme asks which underwater vehicle carries a survey payload furthest per unit of energy. Earlier steps found that a buoyancy glider, using a measured Seaglider power budget, beats a propeller AUV on energy per metre at every AUV hotel load we could source. That left out time, and a glider moves at about 0.2 m/s.

Milestone 4f puts both on the same 1.5 kWh battery (the REMUS 100 vendor figure). The glider side uses a measured Seaglider load of 0.095 W and the AUV side uses sourced hotel loads of 8 W (Tethys design estimate) and 104 to 175 W (REMUS, implied by vendor endurance).

- The glider covers a median 2,919 km over about 164 days. These absolute figures are not a fielded number, since the battery is far smaller than a real glider's pack.
- The AUV covers 363 to 445 km in 5 days at 8 W, and 41 to 69 km in under a day at REMUS-class loads.
- The glider out-ranges the AUV in all 90 cases at every hotel load, and takes longer in all 90.

So the choice is a deadline question: under about a week, an AUV; for persistent observation, a glider. Limits: the AUV's best speed hits the 1.5 m/s grid ceiling at the higher loads, so its ranges are lower bounds; no ocean current; steady flight. Code, log and results: `research/marine-hull/experiments/run_endurance_days.py` and `LOG.md`.

*Written with AI assistance.*
