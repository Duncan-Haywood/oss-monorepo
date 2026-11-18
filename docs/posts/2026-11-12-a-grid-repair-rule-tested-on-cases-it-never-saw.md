---
title: "A grid dispatch repair rule, tested on cases it never saw"
seo_title: "DC OPF dispatch repair: a held-out test on PGLib angle-limited grids"
date: 2026-11-12
description: "Rules tuned on 11 congested PGLib grids repair 7 of 11 held-out angle-limited grids once angle limits are linearised. Blind to angles, they repair 3."
tags: [research, grid-linopf, infra-dcopf, optimal-power-flow, PGLib, power-systems]
---

Electricity markets dispatch generators with a linear (DC) model of the grid. Earlier this week [infra-dcopf](/research/infra-dcopf/) found that on the 11 congested cases of the PGLib-OPF benchmark library, the DC dispatch overloads a line in every one once real AC power flow is applied. A repair that relinearises the AC power flow a few times (loss factors and line-flow sensitivities from AC power flows, a quadratic programme, a step box) fixed 7 of the 11 at the AC optimum's cost. But its step rules had been adjusted on those same 11 cases. A reviewer would ask the obvious question: does it work anywhere else?

So this run tested it on a set it had never seen. PGLib's "small angle difference" (SAD) cases are the library's typical grids with each line's voltage-angle difference held to 4.7 to 16.2 degrees, a stand-in for stability limits. We wrote down predictions before running. Two versions ran on the 12 cases: the rules exactly as committed, and the same rules with two extra linear rows per line for its angle limit.

The frozen version doesn't model angles, and it shows. On four grids its dispatch comes out 6.5 to 17.6 % cheaper than the true AC optimum, which is only possible because it breaks up to 16 angle limits. It is fully feasible on 3 of the 11 grids with an AC optimum. With the angle rows and no other change, it is feasible on **7 of 11**, each at the optimum's cost. That is the same rate as on the cases the rules were tuned on. We had predicted at least 8, so that prediction is refuted, narrowly. Three of the four misses end within 0.01 % of a limit, the same near-miss pattern as before. The fourth fails because its starting point has no AC power-flow solution.

This is now the first step of a research programme, [grid-linopf](/research/grid-linopf/), aimed at IEEE Transactions on Power Systems. The biggest caveat is still open: voltages are held at the AC optimum's own schedule, which a market engine would not have. That is the next step. Code and numbers are in [results_sad.txt](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/infra-dcopf/experiments/results_sad.txt). Written with AI assistance.
