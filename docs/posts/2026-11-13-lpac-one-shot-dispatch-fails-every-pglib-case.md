---
title: "A linear power flow with voltages in it still gave no feasible dispatch on 34 grid cases"
seo_title: "LPAC one-shot dispatch: AC feasibility on PGLib-OPF"
date: 2026-11-13
tags: [grid-linopf, infra-dcopf, research, power-systems]
description: "LPAC-C, run once and checked with an AC power flow, is fully feasible on 0 of 34 PGLib cases and has no solution on 9. The repair gets 21."
---

Grid operators and markets dispatch generators with a linear model of the network. This programme asks when that dispatch survives the real AC physics, and how much work it takes to repair it when it doesn't. So far the answer has been measured against the plain DC model, which ignores losses, voltages and reactive power. That is an easy target. Today's step tests a strong one. LPAC (Coffrin and Van Hentenryck, 2014) is a linear model that keeps reactive power and voltage magnitude. If a one-shot model like that gave feasible dispatches, the repair would not be needed.

I built the cold-start form, LPAC-C, as the PowerModels.jl library writes it. It is solved as a conic program by Clarabel, with SCS as a second solver. The test checks its branch equations against PYPOWER's own flows at an AC solution, phase shifters included. I then took LPAC's generator outputs and voltage setpoints, ran one AC power flow and applied the same checks as the repair: thermal, slack, angle, voltage and reactive limits. The benchmark is the same 34 PGLib-OPF v23.07 cases with an AC optimum, across the typical, congested and small-angle-difference sets. I wrote five predictions down before writing any of the code.

**No case is feasible one-shot.** The LPAC dispatch is fully feasible on 0 of 34. I had predicted at most 10, against the repair's 21, so the programme's hypothesis that one shot is not enough held more strongly than expected. On the 25 cases where LPAC has a solution, the AC power flow breaks reactive limits on 21 and voltage limits on 20. The cause is visible in the solution: 376 of the 1,000 generators get a voltage setpoint exactly on a bound. In LPAC's linear voltage model nothing makes an interior voltage better than a corner. Its own thermal rows hold, but the AC flows they stand for run up to 17 % over rating.

**On angle-limited cases it often has no answer at all.** LPAC-C is infeasible on 9 of the 34 cases, including 7 of the 11 small-angle-difference cases, even though every one has an AC optimum. SCS agrees on 8 of the 9 and stops at its iteration limit on the ninth. This diagnostic ran after the main run, so it was not one of the predictions: removing the angle limits makes 8 of the 9 solvable, and removing ratings, reactive limits or voltage bands helps far less often. A likely reason, not yet tested: LPAC's real-power flow is linear in the angle difference with no voltage factor, so at tight angle limits it can carry less power than the real network at 1.05 per unit.

**Four of my five predictions failed.** I expected LPAC to clear thermal, slack and angle limits on at least 10 cases. It cleared 4, one more than the DC dispatch. I expected its cost to be within 1 % of the AC optimum on 27 cases. It was on 16. I expected the voltage-only AC stage after it to finish 15 cases. It finished 8.

**As a starting point it is about as good as DC.** Started from LPAC's point instead of the DC dispatch, the repair is fully feasible on 17 of the 25 cases LPAC solves, against 15 from DC. That is 5 cases gained and 3 lost, a sign-test P of 0.73: no detectable difference. Where both finish, the LPAC start finishes in fewer rounds on 7 of 12 and never takes more.

The result is narrow. It covers one LPAC form, with a conic cosine bound rather than the paper's tangent cuts, one load point per case and one AC solver. LPAC's warm-start form, which needs an AC base point, and an optimised one-shot linearisation are the next baselines.

Code, tables and log: `research/infra-dcopf/` (`src/infra_dcopf/lpac.py`, `experiments/run_lpac.py`, `results_lpac.txt`, `results_lpac_infeasible.txt`); programme: `research/grid-linopf/`. Written with AI assistance (Claude Code).
