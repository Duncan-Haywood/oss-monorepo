---
title: "Exact derivatives didn't speed up the grid repair. The QP takes the time"
seo_title: "Analytic vs finite-difference sensitivities in an OPF repair"
date: 2026-11-13
tags: [grid-linopf, infra-dcopf, research, power-systems]
description: "Jacobian sensitivities match finite differences to 1e-5 and keep the repair at 29 of 34 PGLib cases, but run time falls only 1.1x: the QP takes 98-99 %."
---

This programme repairs the DC dispatch a market engine would clear so that it is feasible under the AC power flow. Each round of the repair linearises the AC power flow around the current point, solves a QP and checks the result. Until today the linearisation came from finite differences: one extra AC power flow per generator and per voltage setpoint, which is up to 251 power flows per round on PGLib's 240-bus case. The obvious fix is to take the same derivatives from the Newton Jacobian that the power flow already builds. That needs one sparse factorisation per round, by the implicit function theorem.

I wrote down four predictions before running it.

**The derivatives are right.** The analytic sensitivities cover slack power, apparent flow at both ends of every branch, angle differences, load-bus voltages and generator Q. On 32 of the 34 PGLib cases with a power flow at the start, they agree with central differences to 2.3e-6 of each column's scale. The other two (the 118-bus case) differ by 1.3e-3. That falls a hundredfold when the difference step falls tenfold, so the difference quotient was the inaccurate one, near a 1.1 MVA branch flow.

**The answers barely move.** With the analytic sensitivities the repair is fully feasible on 19 of 34 cases (finite differences: 18). With the voltage-only stage after it, 29 of 34 (28). The verdict is the same on 31 cases. So the headline counts do not depend on finite-difference noise.

**It is not much faster.** Power flows per round fell from up to 251 to 2. The repair's total time fell from 1,491 s to 1,353 s, 1.1x against a predicted 5x or more. A profile shows why: the interior-point QP takes 98 to 99 % of each repair (190 of 192 s on the 240-bus SAD case). The power flows take under a second, and the Jacobian solve under a quarter of a second. The QP carries 758 to 2,452 inequality rows every round, and its elastic version adds a slack variable per row. The bottleneck I had planned around was never the real one.

**The price of a finished repair depends on the path.** On the 17 cases both versions finish, the cost moved by more than 0.05 percentage points on 6. On the 14-bus SAD case it moved from 0.77 % to 3.85 % above the AC optimum. The repair stops at its first feasible round, and a 1 MW finite-difference step is enough to send it down a different path to a different first feasible point. The claim "feasible at close to the optimum's cost" needs a phase that keeps cutting cost after the dispatch becomes feasible. Better derivatives won't supply it.

Next: a sparse QP that keeps only rows near their bounds, so the repair can run on PGLib's 500 to 2,000-bus cases (the held-out set), and a pre-registered post-feasibility phase. All of this is modelled on PGLib-OPF v23.07 with PYPOWER, with one AC solver and one load point per case.

Code, tables and log: `research/infra-dcopf/` (`src/infra_dcopf/vlin.py`, `experiments/check_sens.py`, `experiments/profile_vlin.py`, `results_sens.txt`, `results_vlin_margin_analytic.txt`); programme: `research/grid-linopf/`. Written with AI assistance (Claude Code).
