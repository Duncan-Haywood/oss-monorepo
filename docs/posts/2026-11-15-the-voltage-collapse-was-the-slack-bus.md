---
title: "The voltage collapse was the slack bus"
seo_title: "AC power flow fails at the DC OPF dispatch? Check the slack unit"
date: 2026-11-15
tags: [research, power-systems, optimal-power-flow, voltage-stability, ipopt, grid-linopf]
description: "On five PGLib-OPF RTE networks the DC dispatch looked past a voltage-collapse fold. The cause was a 30 MW slack unit. Moving it gives all five a power flow."
---

Yesterday's post in the [`grid-linopf`](../../research/grid-linopf/) programme ([the fold post](2026-11-14-the-dc-dispatch-sits-past-a-voltage-collapse-fold.md)) found six PGLib-OPF cases where the DC optimal power flow's dispatch has no AC power flow. Five are 1,888- and 1,951-bus French transmission (RTE) networks. When we scaled load and the DC dispatch up together, the power-flow Jacobian went singular between 48 and 85 % of load, which is a saddle-node fold. The post ended on a plan to raise the voltages before repairing the dispatch. This run carried out that plan, watched it fail, and found out why. The answer was not the voltages.

## Raising the voltages first failed

Both pre-registered versions failed. The first was a reactive stage at the fold: an AC OPF over voltages and reactive power, with each generator's real power pinned to the DC dispatch. PIPS, PYPOWER's interior-point solver, found no solution for it on any of the six cases. The second used the voltage schedule of an AC OPF solved at reduced load. PIPS found no such optimum on any RTE case. On case300 that schedule moved the fold only from 85.5 % to 89.2 % of load.

## The solver was part of the problem

PIPS turned out to stop with "Numerically failed" after 12 iterations on case1951_rte at 10 %, 30 % and 100 % of load alike. Its failures there tell us about PIPS, not about the network. So the run built a second solver. [`ipopt_nlp.py`](../../research/infra-dcopf/src/infra_dcopf/ipopt_nlp.py) passes the exact problem PYPOWER builds for PIPS (same model, same start, same result fields) to IPOPT. It solved **all 12** large cases PIPS cannot, each within **0.005 %** of the objective PGLib-OPF publishes ([`results_ipopt_ref.txt`](../../research/infra-dcopf/experiments/results_ipopt_ref.txt)).

IPOPT still said the pinned reactive stage was infeasible, even with thermal, angle, reactive and voltage limits all relaxed. A problem that survives that much relaxing has to be held by something else.

## The slack unit was carrying all the losses

The DC dispatch is lossless. Pin every other generator to it, and the slack unit, the one the power flow lets float, must supply all of the network's AC losses. On case300 the slack had to give 1,544 MW at the stall, against a 718 MW limit. On the RTE cases it was worse. The case files put the reference at a bus with no live generator, so PYPOWER's rule promotes the first PV bus with a live unit, which holds a 15 to 30 MW unit. Along the continuation that unit had to give 505 to 687 MW, 22 to 34 times its rating, all at one bus ([`diag_slack_fold.txt`](../../research/infra-dcopf/experiments/diag_slack_fold.txt)).

Moving the reference to the largest unit, with nothing else changed, removes the fold on every RTE case. The same continuation reaches full load on all five. The Jacobian's smallest singular value stays at 64 to 93 % of its no-load value, against 5 to 9 % at yesterday's stalls ([`diag_slack_move.txt`](../../research/infra-dcopf/experiments/diag_slack_move.txt)). case300 still folds, at 99.8 % of load.

## The frozen repair then works on three of five

The next run was pre-registered: the programme's frozen repair, a successive linearisation over generator real power and voltage setpoints with no constant changed, started from that full-load power flow. The starts are badly infeasible, with up to 90 overloaded branches (the worst at 229 %), up to 293 buses out of voltage band, and the new slack up to 1,657 MW outside its range. Even so, the repair reaches a fully feasible point on three of five ([`results_bigslack.txt`](../../research/infra-dcopf/experiments/results_bigslack.txt)):

| case | fully feasible at round | cost vs PGLib's optimum |
|---|---|---|
| case1888_rte API | 13 | +0.62 % |
| case1951_rte TYP | 17 | +0.02 % |
| case1951_rte SAD | 20 | +0.05 % |
| case1888_rte TYP, SAD | not within 20 rounds; one bus out of voltage band | (not feasible) |

All three predictions held. Adding case300, which was repaired yesterday, 4 of the 6 cases whose DC dispatch had no power flow now reach a feasible point within 1 % of the optimum.

## What it means

Yesterday's post said the DC dispatch on these networks was past the loading limit and that no Newton start could find a power flow. That holds only for the slack unit PYPOWER happened to pick. A single-slack power flow puts the whole network's losses on one bus, and when that bus holds a small unit, the voltages around it collapse. Any method that checks a linear dispatch with an AC power flow needs to state its slack rule, whether that is the largest unit or a distributed slack. On these benchmarks the slack choice decides the result. The programme's held-out tally will be rerun with the slack rule fixed in the protocol and IPOPT as the reference on all 24 cases.

Everything is modelled with PYPOWER, Clarabel and IPOPT on PGLib-OPF v23.07. None of it is measured on a real grid. Plans and predictions were committed before each planned run, and the slack diagnostics are labelled as run after it, in [`LOG.md`](../../research/infra-dcopf/LOG.md). Written with AI assistance (Claude Code).
