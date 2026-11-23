---
title: "Taking the safety margin away from a grid repair's cost phase: more steps, not cheaper ones"
seo_title: "OPF cost phase: capping margins at their own slack"
date: 2026-11-23
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Capping each QP margin at the point's own slack cut empty cost QPs from 185 to 10, but trials leaving the AC-safe set rose from 88 to 275."
---

Earlier today the [grid-linopf](../../research/grid-linopf/README.md) programme added a [cost phase](2026-11-23-grid-repair-cost-phase.md) to its AC repair. Once the repair reaches its first point that passes every AC limit, the phase runs up to 10 more small QPs on the generators' own costs. It keeps a step only if the AC check stays clean and the cost falls. That took back about 40 % of the gap to PGLib's AC optimum on development cases. A third of the cases did not move at all, though, and the diagnosis looked simple.

**The diagnosis.** 185 of the 803 cost rounds had an empty QP. The QP keeps a small safety margin inside every limit: 0.1 % below each branch rating, and similar bands on voltages, reactive power and the slack unit. A clean point often sits inside one of those bands, at 99.95 % of a rating say. Then the point the phase starts from is outside its own QP, and no step inside a small box around it exists.

**The fix tested (rule CS), fixed in the [log](../../research/infra-dcopf/LOG.md) with priors before it ran.** Cap every bound's margin at the slack that row already has at the current point. The point is then always inside the QP. Everything else stays as in rule CP. The same 83 finishing runs were rerun, and all 83 reproduce their stored clean points.

**What came out** (PGLib-OPF cases, PYPOWER power flows, mean % over PGLib's published AC optimum, frozen repair as the start):

| | clean point | rule CP | rule CS | cases that took a step, CP / CS |
|---|---|---|---|---|
| development, 31 cases | +0.391 | +0.229 | **+0.218** | 23 / 29 |
| held-out (500 to 2,000 buses), 10 cases | +0.577 | **+0.508** | +0.516 | 5 / 8 |

- **It fixed what it aimed at.** Empty QPs fell from 185 to 10 rounds, and 76 of 83 finishers took a step, against 56.
- **The margin was doing real work.** Trials that broke an AC limit rose from 88 rounds to 275. With no margin left on a rating, the error of the linear model carries the trial just over it, and the box halves.
- **So it is not adopted.** CS is cheaper on development (20 cases cheaper, 10 dearer, sign test P = 0.099), but not on held-out (3 cheaper, 5 dearer). The test set in advance was "no worse than CP on both splits", and it failed. Rule CP stays. Two of my six priors were wrong. I gave 50 % to CS beating CP on held-out, and 20 % to it closing the held-out gap between the two start rules. That gap is still 0.58 points.

**What it suggests.** The two rules win on different cases. CP wins where the point has margin to spare and many small safe steps add up (case179 SAD: +0.34 % against +0.68 %). CS wins where the point is pinned inside a margin band (case14 API: +0.75 % against +0.29 %). The next rule follows from that: keep the frozen margins and fall back to the cap only on a round whose margined QP is empty. That rule differs from CP only on CP's empty rounds. It still has to be planned and scored. The per-case better of the two, read off today's table, is not evidence.

All numbers are from [`results_slackcap.txt`](../../research/infra-dcopf/experiments/results_slackcap.txt), produced by [`run_slackcap.py`](../../research/infra-dcopf/experiments/run_slackcap.py). These are benchmark cases on a modelled grid, not a measured system. Written with AI assistance (Claude Code).
