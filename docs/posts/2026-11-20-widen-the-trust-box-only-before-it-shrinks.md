---
title: "Box widening ran a grid repair out of rounds on one case; widening only before the box shrinks loses none"
seo_title: "OPF repair: widen the trust box only before it shrinks"
date: 2026-11-20
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "A per-round trace shows why trust-box widening lost case1888 API. Widening only before the first halving finishes 32 of 34 and 11 of 19 cases, none lost."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow inside the limits and inside a trust box, and a rejected step halves the box. [This morning's rule C](2026-11-20-tie-the-widening-to-the-trust-box.md) widens the box when the QP has no solution, capped at twice the current box. It lost no development case, but it lost held-out case1888_rte API, a 1,888-bus French network that the frozen repair finishes at round 13. Rules E and O lost that case too.

**What a per-round trace shows.** The stored runs kept only each round's status, so we added an opt-in trace to the repair. For each round it records the box halvings, the merits, whether the step was accepted, the worst branch end and what the QP's linear model predicted for it. We then reran the case under five arms, with predictions written into the [log](../../research/infra-dcopf/LOG.md) first.

- **It is not a stall.** After round 5, rule C accepts 12 of its 15 steps and the merit falls every time. When the 20-round budget ends, one branch end sits at 100.03 % of its rating. The frozen repair was at that merit at round 11, so rule C is about nine rounds behind.
- **Where the rounds go.** The widened steps on rounds 1 and 2 cut voltage violations from 35 to 7 but leave the worst overload at 178 % and 211 % (the frozen run is at 158 % and 113 %). The merit accepts them because its voltage term falls more than its thermal term rises. The hard QPs that follow repay the overloads slowly. On every round the worst branch end is one the linear model put exactly on its 99.9 % margin, and it lands 0.03 to 8 points higher in the AC check. One branch is predicted to fall from 103 to 106 % to 99.9 % three rounds running and lands at 106.9, 106.5 and 106.2 %.
- **Any one firing fewer is enough.** Withhold the round-1, round-2 or round-5 widening and the case finishes at round 18, 20 or 17. Each of those points costs less than the frozen repair's (+0.54, +0.23 and +0.27 % over PGLib's AC optimum, against +0.62 %).

**Rule P.** Only the round-5 firing came after a halving. Rule P therefore keeps rule C's widening while the box is unhalved, and once a rejected step has halved it, a failed QP goes back to the old elastic step. We fixed the rule and seven predictions before running it on the same 34 development and 19 held-out PGLib-OPF cases.

| | frozen | rule C | rule P |
|---|---|---|---|
| development finishers (of 34) | 31 | 32 | **32** |
| held-out finishers (of 19) | 10 | 10 | **11** |
| held-out without case1888 API (of 18) | 9 | 10 | **10** |
| finishers lost against frozen | | 1 | **0** |

All seven predictions held. Rule P keeps both of rule C's gains, case73 API (never finished by the frozen repair) and held-out case500 SAD, and it finishes case1888 API at round 17. In development it also brings two of rule C's costlier finishes back near frozen cost: case200 API at +0.24 % (rule C +2.30 %) and case57 API at +0.71 % (rule C +1.44 %).

**How far this goes.** The gain is one development case and, leaving out the case that suggested the rule, one held-out case. Finishing rounds and costs on cases both finish do not change significantly (sign tests P = 0.75 and above). On held-out, the shared finishers cost 0.20 points more on average, mostly from case588 API (+3.55 % against +0.87 %, the same under rule C). A held-out case suggested rule P, so held-out can no longer confirm it. The next step runs PGLib-OPF cases above 2,000 buses, never used so far, under the frozen repair, rule C and rule P, with the comparison fixed before it runs.

Code and numbers: [`diag_case1888.py`](../../research/infra-dcopf/experiments/diag_case1888.py), [`diag_case1888.txt`](../../research/infra-dcopf/experiments/diag_case1888.txt), [`run_enlarge_pre.py`](../../research/infra-dcopf/experiments/run_enlarge_pre.py), [`results_enlarge_pre.txt`](../../research/infra-dcopf/experiments/results_enlarge_pre.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
