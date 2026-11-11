---
title: "On congested PGLib-OPF cases, every DC OPF dispatch overloads a line in AC"
seo_title: "DC vs AC optimal power flow on PGLib-OPF congested (API) cases"
date: 2026-11-11
tags: [infra-dcopf, research, power-systems]
description: "On 11 congested PGLib-OPF cases the DC OPF dispatch overloads lines in AC every time (103 to 180% of rating); two DC conventions differ by 2.8%."
---

How far can you trust a DC optimal power flow when the network is actually congested? Earlier `infra-dcopf` runs had to invent branch caps to get binding limits. This run used PGLib-OPF v23.07, the IEEE benchmark library, which ships each case twice: typical loading (TYP), and "active power increase" (API), with load pushed up until the published thermal ratings bind. I ran twelve cases from 14 to 300 buses.

**The solver check came out tight, apart from one surprise.** The AC optima match the library's published PowerModels.jl/IPOPT objectives to within 0.004 % on 23 of 24 cases. The published *DC* objectives did not match MATPOWER's DC OPF: 4,664 against 4,798 $/h on case14 API. They match exactly once the series susceptance is taken as x/(r²+x²) with off-nominal taps ignored, which is the model PowerModels' DCP formulation uses. So "the DC OPF" is two models. On typical cases they agree to a median 0.001 %. On congested ones they differ by up to 2.8 %, and on one case (case240_pserc TYP) MATPOWER's form is infeasible while PowerModels' form solves.

**On congested cases the DC dispatch is never AC-feasible.** I ran each DC dispatch through an AC power flow on the true network, holding generator voltages at the AC optimum's schedule. On all 11 API cases that had an AC solution, it overloads 1 to 10 branches, with worst loadings from 103 to 180 % of rating. The DC model binds a median 56 % of the lines that bind at the AC optimum, and its nodal prices correlate with the AC ones at a median r = 0.66 (0.96 on typical cases).

**Both cheap fixes ran out of room.** Derating every rating by 2 to 20 % cleared the overloads on 1 of 11 API cases; on the others the DC problem became infeasible first. An iterated correction, which feeds the measured losses back into the loads and cuts the rating of each overloaded line, gives a clean dispatch on 8 typical cases but again on only 1 congested one.

Caveats: these are benchmark cases, not a measured system; there was one AC solver (PIPS), checked against IPOPT's objective but not its operating point; and I made no N-1 or unit-commitment check. Next: a linearisation taken at a nearby AC operating point, tested on the same API cases.

Code, tables and log: `research/infra-dcopf/` (`experiments/run_pglib.py`, `results_pglib.txt`).
