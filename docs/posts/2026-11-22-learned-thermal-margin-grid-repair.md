---
title: "A thermal margin learned from AC errors makes a grid repair finish sooner and dearer, and fails adoption"
seo_title: "OPF repair: a learned thermal margin, sooner but dearer"
date: 2026-11-22
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Pulling each branch's limit in by the AC error it showed: one stall finished, one lost, held-out repairs 3.5 rounds faster but +0.47 cost points."
---

The `grid-linopf` programme repairs a dispatch from the linear (DC) market model until it passes the full AC power flow. Each round solves a small quadratic program (QP) over a linearisation of the AC equations, then checks the result against the real power flow. Every branch limit is aimed 0.1 % inside its rating, so that the linear model's first-order error lands inside the limit.

**The problem.** An [earlier diagnosis](2026-11-20-grid-repair-widening-fails-first-unused-cases.md) on a 1,888-bus French network found that the 0.1 % margin is three orders of magnitude too small where it matters. Branches the QP held at exactly 99.9 % landed up to 8 points over their rating in the AC check. That gap is the curvature of the power flow, which a linear model cannot see.

**The idea, rule K.** Learn the margin from the mistakes. When a branch end the QP held inside its limit comes back overloaded, record the gap (AC loading minus predicted loading) and pull that row's limit in by it on later rounds. The pull is capped at 5 % of the rating and shrinks fourfold each time the trust box halves, because a second-order error scales with the step squared. Branches that never misbehave keep the plain margin, so a case where the rule never fires runs exactly as before. It did on all 13 such cases. We fixed the rule, the cases, eight predictions and an adoption test in the [log](../../research/infra-dcopf/LOG.md) before anything ran.

**What came out.**

| | finishers, frozen repair &rarr; rule K | where both finish |
|---|---|---|
| development, 34 PGLib-OPF cases | 31 &rarr; 31: gains case118 API, loses case240 SAD | 8 faster, 7 slower; +0.22 cost points |
| held-out, 19 cases of 500 to 2,000 buses | 10 &rarr; 10 | **8 of 10 sooner**, median 3.5 rounds (sign test P = 0.039); **+0.47 cost points** |

- **One old stall finishes.** case118 API had beaten all six rules tried on it since 13 November. Rule K makes it clean at round 29, at +0.78 % over the AC optimum.
- **One finisher is lost, and the reason is clear.** On case240 SAD six rows fire on round 1, the only round with no box on active power, so their margins start at the cap. They shrink only when the box halves, and accepted steps never halve it. So every QP with hard limits is empty from round 1 to round 30. A margin learned from an unboxed step is the wrong size for the boxed steps after it.
- **Faster finishes cost more.** Where both versions finish on held-out cases, rule K usually gets there sooner. But it holds flows further inside their ratings than the AC optimum does, and the bill is +0.47 percentage points on average, up to +1.8.
- **The overload stalls stay stalled.** On the three 1,354-bus PEGASE cases the worst overload falls by 3 to 7 points, and none comes clean. A smaller cap of 2 % did worse on both splits.

The adoption test needed no loss in development and a net gain held out. Neither happened, so the frozen repair stays and the result goes on record as negative, with a mechanism attached.

**Why a practitioner might care.** If you correct a linearised dispatch with per-line offsets learned from AC feedback, measure each offset on a step of the size you will take next. Expect the corrections to trade cost for feasibility. The next steps follow from this run: scale the learned margin by the step actually taken, and add a cost phase after the first clean point, so a clean dispatch found early can be made cheaper.

Code and numbers: [`run_kmargin.py`](../../research/infra-dcopf/experiments/run_kmargin.py), [`results_kmargin.txt`](../../research/infra-dcopf/experiments/results_kmargin.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
