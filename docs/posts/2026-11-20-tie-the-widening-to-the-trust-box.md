---
title: "Tie a grid repair's box widening to its current trust box and the cycles stop: 32 of 34 finish, none lost"
seo_title: "OPF repair: capping trust-box widening at the current box"
date: 2026-11-20
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Capping a grid repair's box widening at twice the current trust box, not the first, ends its cycles: 32 of 34 cases finish, none lost; held-out unchanged."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow inside the limits and inside a trust box; a rejected step halves the box. Two days of steps have been about what to do when that QP has no solution.

[Rule E](2026-11-19-widening-a-grid-repairs-trust-box-cycles.md) widened the box just enough to make the QP solvable. It fixed every empty QP but rebuilt the step it had just rejected 68 times out of 94. Rule O allowed the widening once per base point, which stopped exact repeats but not near-repeats: a tiny accepted step moved the base point and re-armed it. The reason was the same both times. Rejections halve the stored box, but the widening's cap stayed at twice the *first* box, so it could always reach back out to the same large step.

**Rule C** changes one thing: the cap is twice the *current* box. Before any rejection nothing changes. After a rejected widened step the box halves, the needed scale doubles past the cap, and the repair falls back to its old elastic step. We wrote the rule and seven predictions into the [log](../../research/infra-dcopf/LOG.md) before running it on the 34 development cases and the 19 held-out PGLib-OPF cases that reach the repair.

| | frozen | rule E | rule O | rule C |
|---|---|---|---|---|
| development finishers (of 34) | 31 | 30 | 31 | **32** |
| development finishers lost | | 2 | 1 | **0** |
| firings that rebuild the rejected QP | | 68 | 0 | 0 |
| held-out finishers (of 19) | 10 | 8 | 9 | **10** |

All seven predictions held. case73 API, which the frozen repair never finished, is clean at round 12 (3.26 % above the AC optimum). case30 API and case200 API, lost by both earlier rules, finish again: on case30 API the rule fires on rounds 1 and 4, then declines on every later failure because no workable box lies within twice the shrinking one. Held-out, case500 SAD finishes for the first time and case793 API comes back.

**What it does not fix.** The gain is one development case and no net held-out case. Held-out case1888 API, which the frozen repair finished at round 13, is lost by every widening rule. case30 API and case200 API finish later and at a higher cost than the frozen repair (1.26 % and 2.30 % above the optimum, against 0.34 % and 0.13 %). Finishing rounds and costs on the cases both finish are unchanged within noise (sign tests P = 0.77 and 0.69).

**Next.** Diagnose case1888 API, then confirm rule C on PGLib-OPF cases not used so far before it replaces the frozen repair.

Code and numbers: [`run_enlarge_rel.py`](../../research/infra-dcopf/experiments/run_enlarge_rel.py), [`results_enlarge_rel.txt`](../../research/infra-dcopf/experiments/results_enlarge_rel.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
