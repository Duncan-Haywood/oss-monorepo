---
title: "Should a grid repair accept a step on total overload or the worst line? A pre-registered test on PGLib-OPF"
seo_title: "OPF repair acceptance test: total overload vs worst line"
date: 2026-11-18
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Scoring an AC-feasibility repair on summed overload instead of the worst line changed 5 decisions in 34 cases, and held out it cost two finishers."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow. When no point satisfies every limit, an elastic version of that QP minimises the **sum** of overloads instead. The repair then keeps or rejects the trial point with a merit function that scores the **worst** overload.

[Yesterday's step](2026-11-17-two-grid-repair-stalls-two-different-causes.md) found that on PGLib-OPF case118 (congested, "API" version) the late elastic steps lowered the sum and were rejected because the worst line got slightly worse. The obvious fix is to make the acceptance test match the QP. Before running anything we wrote that rule into the [log](../../research/infra-dcopf/LOG.md) with six predictions. Rule S replaces the merit's worst thermal excess with the summed excess over every rated branch and changes nothing else.

**Development (34 cases, 30 rounds): almost inert.** The two merits disagreed on 5 trials across all 34 cases. 31 of 34 cases finish either way. 30 of those finish identically, and one finishes a round sooner. case118 API still doesn't finish. Rule S accepted 26 of its 30 trials (the old rule accepted 20) and still ended with one branch at 100.27 % of its rating. From round 3 on, every QP on that case is the elastic one: the hard QP has no solution. So the acceptance test wasn't what held the case back, and we withdrew that reading.

**Held-out (19 larger cases, 500 to 2,000 buses, 20 rounds): worse at finishing, better on cost.**

| | old merit (worst line) | rule S (total overload) |
|---|---|---|
| cases fully AC-feasible within 20 rounds | 10 of 19 | 8 of 19 |
| rounds where both finish (8 cases) | baseline | slower on 3 (2 to 4 rounds), never faster |
| cost over PGLib's AC optimum where both finish | baseline | 0.13 points lower on average (case793 SAD: +0.30 % vs +0.87 %) |

When the worst line is allowed to rise as long as the total falls, the repair moves along the thermal boundary toward cheaper points. It gets there more slowly, and twice it ran out of rounds. With only 2 lost and 3 slower cases, a sign test can't tell either effect from chance (P = 0.50 and 0.25). The direction is consistent, though, and it's what we report.

**What changes.** Nothing in the method: the worst-line merit stays frozen. Two things for the paper. First, the remaining development stall comes from hard-QP infeasibility, not from the acceptance test, so the next step is to find which constraint rows make that QP infeasible. Second, cheaper AC-feasible points lie near the ones the repair stops at, which makes a cost phase after the first clean point worth testing.

Of the six predictions, four held and two were refuted: case118 finishing (prior 35 %) and a held-out gain with no loss (prior 25 %).

Code and numbers: [`run_summerit.py`](../../research/infra-dcopf/experiments/run_summerit.py), [`results_summerit.txt`](../../research/infra-dcopf/experiments/results_summerit.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
