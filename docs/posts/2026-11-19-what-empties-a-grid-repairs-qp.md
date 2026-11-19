---
title: "What makes a grid repair's QP infeasible? The trust box, not the safety margins, on PGLib-OPF"
seo_title: "Infeasible QP in an OPF repair: trust box vs safety margins"
date: 2026-11-19
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On 58 of 58 rounds where a grid repair's QP had no solution, removing the trust box made it solvable. The margins fixed only 13 of them."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow. The QP has to stay inside every limit with a small safety margin and inside a trust box around the current point. If that QP has no solution, the repair falls back to an elastic QP that minimises the overloads instead. If the elastic step makes things worse, the repair rejects it and halves the box.

Two development cases never finish within 30 rounds: PGLib-OPF case118 and case73, both in their congested "API" versions. [Yesterday's step](2026-11-18-scoring-a-grid-repair-on-total-overload.md) found that case118's stall comes from the hard QP having no solution from round 3 on, not from the acceptance test. Today's question: which constraints make it infeasible? We wrote the plan and six predictions into the [log](../../research/infra-dcopf/LOG.md) before the full run.

**Method.** We reran the frozen repair on both cases, unchanged. The reproduction check passed: same statuses and same merit values as the recorded run. Each round we rebuilt the hard QP's constraint set and gave it to a second, independent solver (HiGHS) four times: as run, without the trust box, without the margins, and without either. Where the set was empty, we extracted an irreducible infeasible subset (IIS). That's a set of constraint rows that has no solution together but does if any one row is dropped.

| | case118 API | case73 API |
|---|---|---|
| rounds where the repair's QP solver found no solution | 28 of 30 | 30 of 30 |
| empty by HiGHS too (genuine, not a solver failure) | 28 | 30 |
| non-empty **without the trust box** | **28** | **30** |
| non-empty without the safety margins | 5 | 8 |
| box needed, in units of round 1's box | 0.19 to 0.90 | 1.08 to 1.11 (rounds 3 to 25) |
| box the repair actually had by round 30 | 1/512 of round 1's | 1/262,144 of round 1's |

**The box causes it.** On every failed round, of both cases, the linearised set has a point inside every margin-shifted limit, just outside the trust box. The repair's own rule, which halves the box after a rejected elastic step, then drives it further away. case73 needed a box about 1.1 times its first one on every round from 3 to 25 and instead saw its box halved again and again, 18 times in all. On case118 the needed box shrinks too, but more slowly than the box does.

**What the IIS shows.** On case118, 22 of the 28 subsets tie 10 to 15 line ratings to the power balance and to the full-output limits of 24 to 30 generators. On this stressed copy, the dispatch can't reach the units that could deliver power around the congested lines within one box. case73's subsets are small: 8 to 21 rows, a few lines, two bus voltages and a few units. One 21-row set repeats on 15 rounds.

**A correction.** On 2026-11-17 we read case73's stall as a local stationarity of the repair's controls, and that reading doesn't hold up. The probe behind it only ever shrank the box. A box 1.1 times the first one has a margin-feasible linear point on every round. There's a caveat, though. case73's margin-shifted AC optimal power flow has no solution, so the linear model is promising a point that the full AC model may not have.

Four predictions held and two were refuted: a median box scale of at most 2 for case118 (it was 4.6), and margins rather than the box emptying case73's set.

**Next.** A method change, fixed on the 34 development cases before it is scored on held-out ones: when the hard QP is empty, widen the box to the smallest size that has a solution (capped at round 1's box) before falling back to the elastic QP.

Code and numbers: [`run_iis.py`](../../research/infra-dcopf/experiments/run_iis.py), [`results_iis.txt`](../../research/infra-dcopf/experiments/results_iis.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
