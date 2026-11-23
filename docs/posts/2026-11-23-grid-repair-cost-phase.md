---
title: "A grid repair that stops at the first safe point leaves money behind: a cost phase takes back 40 % of it"
seo_title: "OPF repair: a cost phase after the first AC-feasible point"
date: 2026-11-23
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Ten hard cost QPs after the first clean point cut the gap to PGLib's AC optimum from +0.39 to +0.23 points on 31 cases, in 1.6 s, never worse."
---

The [grid-linopf](../../research/grid-linopf/README.md) programme asks when a linear optimal power flow is safe to dispatch from, and which cheap AC repair makes it safe. The repair it studies is a successive linearisation of the AC power flow. It steps from the DC dispatch towards a point that passes every AC limit check, and until today it **stopped at the first such point**. That point is safe. It is not the cheapest safe point nearby.

Yesterday's [rule K1](2026-11-22-grid-repair-margin-without-round-one.md) made that sharper. On held-out cases it reached a clean point sooner on 8 of 10 cases, but 0.65 cost points dearer on average. So today's question: if the repair keeps going after the first clean point, can early and dear become early and cheap?

**The rule (rule CP), fixed in the [log](../../research/infra-dcopf/LOG.md) with priors before anything was scored.** From the first clean point, run up to 10 more QPs on the case's own generator costs. Each one has no elastic fallback and sits inside a small box: 5 % of each unit's range and 0.0075 pu on voltage setpoints. A step counts only if the full AC check is clean and the cost falls; anything else halves the box. The phase can never leave the safe set, so it can never make a point worse.

Each of the 83 finishing runs was rerun to its clean point first, and all 83 reproduce their stored round and cost.

**What came out** (PGLib-OPF benchmark cases, PYPOWER power flows, gap to PGLib's published AC optimum):

| | before | after the cost phase | cases that took a step |
|---|---|---|---|
| development, frozen repair, 31 cases | +0.391 | **+0.229** | 23 |
| development, rule K1, 32 cases | +0.424 | +0.239 | 23 |
| held-out (500 to 2,000 buses), frozen, 10 cases | +0.577 | **+0.508** | 5 |
| held-out, rule K1, 10 cases | +1.228 | +1.057 | 5 |

- **It is worth keeping.** It lowers the mean gap for both repairs on both splits, so it meets the adoption test set in advance. On development it removes about 40 % of the mean excess over the AC optimum: case14 SAD goes from +3.85 % to +0.73 % and case179 SAD from +0.83 % to +0.34 %. It takes a median 1.6 s, against 5.8 s for the repair to reach its first clean point.
- **It does not rescue K1.** Held out, K1 plus the phase is still 0.55 points dearer than the frozen repair plus the phase. It is dearer on 9 of 10 cases (sign test P = 0.021). The cases where K1 paid most, case588 API at +3.1 %, take no cost step at all. The frozen repair stays the start rule.
- **Most of my priors were wrong.** I gave 35 % to the phase closing half the gap on the median case. The median share it closed was 0.10, because a third of the cases do not move. The prediction that it would be cheaper in time than the repair held.

**Why a third of the cases do not move.** Of 803 cost rounds, 185 had no feasible point at all. A clean point often sits between 99.9 % and 100 % of some branch rating. The QP keeps a 0.1 % safety margin below each rating, so the point the phase starts from is outside the QP's own feasible set. Halving the box only makes that worse. The next step is the obvious one: cap each row's margin at the slack that row already has at the clean point, so the starting point is always inside the QP.

All numbers are from [`results_costphase.txt`](../../research/infra-dcopf/experiments/results_costphase.txt), produced by [`run_costphase.py`](../../research/infra-dcopf/experiments/run_costphase.py). These are benchmark cases on a modelled grid, not a measured system. Written with AI assistance (Claude Code).
