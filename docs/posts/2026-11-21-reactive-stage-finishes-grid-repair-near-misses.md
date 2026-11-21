---
title: "A second small AC problem finishes 8 of a grid repair's 22 near misses, each within 0.22 % of the AC optimum"
seo_title: "OPF repair: a reactive stage finishes 8 of 22 near misses"
date: 2026-11-21
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On 33 unused PGLib-OPF cases, an IPOPT voltage and reactive stage lifts a DC-to-AC dispatch repair from 9 to 15 finishers out of 23, at +0.008 to +0.212 % cost."
---

The `grid-linopf` programme takes a dispatch from the linear (DC) market model and repairs it, one round at a time, until it passes the full AC power flow: no branch overloaded, every voltage and every generator's reactive power inside its limits. On the [confirmation split](2026-11-20-grid-repair-widening-fails-first-unused-cases.md), 33 PGLib-OPF cases of 2,001 to 2,999 buses that no earlier step had touched, the repair finished 9 of the 23 cases its DC start reached.

**Most failures were tiny.** Looking at the 22 cases that reach the repair and do not finish, 10 end with no overload, no voltage out of band, and only generators outside their reactive limits, by under 0.1 MVAr in total. On case2383wp_k (the Polish winter-peak network) that is 64 units out by 0.093 MVAr together, under 2 kVAr each. The stopping rule counts that as a failure, and it should, but a fix aimed at active power is the wrong tool for it.

**The test.** The held-out protocol already had a second arm for this, J+R: fix the repair's best dispatch and solve a small AC optimal power flow over voltages and reactive power only, on IPOPT. The confirmation split had never had it. We fixed the cases, the rule, a reproduction gate and six predictions in the [log](../../research/infra-dcopf/LOG.md) before anything ran.

**What came out.**

| confirmation split | J (repair alone) | J or J+R |
|---|---|---|
| protocol start, 23 cases reach the repair | 9 | **15** |
| all 33 cases (second- and third-solver starts) | 10 | **18** |

- The reactive stage finishes **8 of the 10** reactive-only cases. The other two (case2746wop_k) come back with no IPOPT solution or a worse point.
- Every new finisher costs **+0.008 to +0.212 %** over PGLib's published AC optimum, against +0.04 to +6.78 % for the cases the repair finished alone. The repair had already put active power almost where the AC optimum puts it, so the second stage only had to tidy up the voltages.
- None of the 11 cases with real overloads finishes. With active power pinned, the stage cannot move enough flow. Those cases are the next target.
- All six reactive-stage predictions held, including the gate: every rerun reproduced its stored best point exactly.

**A refuted prediction.** One case, case2853_sdet API (a 2,853-bus European network), never got a DC start: PYPOWER's PIPS and Clarabel both failed on the DC OPF. We predicted that a third solver, HiGHS, would show the problem had no solution. It did not. HiGHS solves it at 2,455,317 $/h, within 0.03 % of PGLib's published DC objective, so the earlier "no start" was a solver failure, not an empty problem. With that start the case reaches the repair, so all 33 do, and then it stalls with 76 overloads like its two siblings.

**What this means for a practitioner.** If you clear a market on a DC model and repair the result against AC, a voltage and reactive pass at the end is cheap and pays off. It turned most of this split's near misses into clean dispatches at a fraction of a percent in cost. Solver choice for the DC start is not a detail either: on large networks one interior-point solver's "infeasible" can be another's optimum.

Code and numbers: [`run_confirm_reactive.py`](../../research/infra-dcopf/experiments/run_confirm_reactive.py), [`results_confirm_reactive.txt`](../../research/infra-dcopf/experiments/results_confirm_reactive.txt), [`results_dc_highs.txt`](../../research/infra-dcopf/experiments/results_dc_highs.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
