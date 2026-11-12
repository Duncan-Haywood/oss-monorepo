---
title: "A grid repair that moves generator voltages makes 28 of 34 PGLib cases AC-feasible"
seo_title: "Repairing DC OPF dispatch by moving generator voltages (PGLib)"
date: 2026-11-12
tags: [grid-linopf, infra-dcopf, research, power-systems]
description: "Moving voltage setpoints with P repairs the DC dispatch on 5 of 34 PGLib cases as planned; with a margin inside every limit, 28 of 34 at 0.17 to 0.34 % cost."
---

The previous step of this programme found that a successive-linearisation repair of the DC dispatch had been leaning on an oracle. It held the generator voltages at the AC optimum's schedule. At PGLib's own 1.0 pu setpoints it cleared 2 of 11 congested and 2 of 11 angle-limited cases instead of 6 and 7. Adding a voltage-only AC OPF afterwards made 16 of 34 cases feasible, at 0.8 to 4.3 % above the optimum's cost on average.

This step makes the voltage setpoints decision variables too. The repair linearises the AC power flow in active power and in one voltage setpoint per generator bus. Each round takes about one finite-difference power flow per variable. The linear model carries rows for every limit class: thermal, slack, angle, bus voltage and generator Q. The start is the same: the plain DC dispatch at 1.0 pu, on all 36 PGLib-OPF v23.07 TYP, API and SAD cases.

**As pre-registered, it failed.** It was fully feasible on 5 of 34 against a predicted 20 or more. The failures are almost all near-misses. On 19 cases the repair ends within 0.1 % of every thermal rating and 0.1 MVAr of every Q limit, but not inside them. A typical miss is one branch at 100.02 % or one unit 0.002 MVAr past its limit. The QP puts rows exactly on their bounds, and the first-order error then decides which side they land on.

**One change, made after seeing that result, fixed most of it.** Every bound in the QP is pulled slightly inside its limit: 0.1 % of rating, 0.1 MW, 0.01 degrees, 0.001 pu and 0.1 MVAr. I wrote the predictions down before the run, but it is still a post-hoc variant on the same cases. With the margin, the repair is fully feasible on 18 of 34, and 17 of the 19 near-misses finish. Running the voltage-only stage on the rest brings it to **28 of 34**, at a mean **0.17 to 0.34 %** above the AC optimum's cost, worst 0.88 %. On the angle-limited set, the margin variant alone (8 of 11) beats the old repair run with the oracle's own voltages (6).

What it does not show yet: the margins were tuned here, so 28 of 34 is a tuning-set number until the frozen rules run on held-out cases. There is one AC solver (PIPS), one load point per case, and no LPAC baseline yet. The largest cases are slow: the 300-bus congested case takes 10 minutes and never finds a feasible QP. Next: the frozen rules on PGLib's larger cases, and the LPAC and optimised-linearisation baselines.

Code, tables and log: `research/infra-dcopf/` (`src/infra_dcopf/vlin.py`, `experiments/run_vlin.py`, `results_vlin.txt`, `results_vlin_margin.txt`); programme: `research/grid-linopf/`. Written with AI assistance (Claude Code).
