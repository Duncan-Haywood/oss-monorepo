---
title: "On a 2,869-bus grid, the repair's overload stalls come from its step box, not its linear model"
seo_title: "Why an OPF repair stalls on case2869_pegase overloads"
date: 2026-11-25
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On 38 failed rounds of three case2869_pegase stalls, the linear set is never empty once the trust box goes; margins clear 1. The box holds it, not the model."
---

The [grid-linopf](../../research/grid-linopf/README.md) programme repairs the dispatch from a linear (DC) optimal power flow until it passes every AC limit. Each repair round linearises the AC power flow, then solves a quadratic program (QP) inside a trust box around the current point. If that "hard" QP has no solution, the round falls back to an elastic version that only reduces overloads.

On the 33 confirmation cases, which no rule was tuned on, the method finishes 18. The [last post](2026-11-24-grid-repair-method-of-record-unused-cases.md) named the closest misses: the three versions of case2869_pegase. They end 20 rounds with 2 to 4 branches still over their rating, at 101 to 110 % loading.

A stall like that has three possible causes:

1. **The linear model.** At the stall point, no dispatch inside the physical limits relieves those branches.
2. **The safety margins.** The repair aims 0.1 % inside each rating and 0.001 pu inside each voltage limit, and that can leave no feasible point.
3. **The trust box.** A feasible point exists, but it lies farther away than the step is allowed to go.

Each cause calls for a different fix, so I measured which one it is. The [plan and six predictions](../../research/infra-dcopf/LOG.md) were committed before the run. A wrapper around the repair's QP call changes nothing in the repair. On every round where the hard QP failed, it asked an independent LP solver (HiGHS) four questions about the same linearised constraints: is the set empty as run, without the box, without the margins, and without either?

**What came out** (all three reruns reproduce their stored runs first):

| 38 failed hard QPs | empty | not empty | not settled* |
|---|---|---|---|
| as run | 38 | 0 | 0 |
| without the trust box | **0** | 33 | 5 |
| without the margins | 37 | 1 | 0 |
| without either | 0 | 34 | 4 |

\*the LP hit its time limit; these are counted as unknown, not as answers.

- **It is the box.** Wherever HiGHS settled the question, removing the trust box gives a feasible set, and the linear model has a dispatch inside every physical limit with no overload at all. Removing the margins clears 1 round of 38. Development cases of 118 and 73 buses [showed the same thing on 2026-11-19](../../research/grid-linopf/README.md), so the mechanism now holds from 73 buses to 2,869.
- **The box the step needs grows as the box shrinks.** The smallest workable box is 1.04 to 102 times the current one (median 3.45). On the API case it roughly doubles every one or two rounds from round 10: each rejected step halves the box, while the base point barely moves.
- **That explains why widening failed.** Rule C let the box grow to at most twice its current size. On 18 of 29 settled rounds that is not enough. Rules E, O, C and P all widen the box by a fixed multiple, and that line was already closed for net finisher gains. Now we know why it could not reach these cases.
- **Three predictions failed, and two of them were the interesting ones.** I gave even odds that the set would often be empty even without the box (it never was), and 40 % that the linear model itself would be infeasible (it never was).

**What it does not show.** This is a diagnosis, not a fix: no case finished. It covers one network in three versions. 5 of 38 no-box answers are unsettled, because the LPs on 2,869 buses ran into a time limit. The next step is a step rule that does not tie the step length to the box. One option is to solve the hard QP without the box, which these results say is always possible here, then shorten the step along that direction until the AC check accepts it. It will be fixed on development and held-out cases before it touches these three.

Numbers: [`diag_overload_stall.txt`](../../research/infra-dcopf/experiments/diag_overload_stall.txt), produced by [`diag_overload_stall.py`](../../research/infra-dcopf/experiments/diag_overload_stall.py). Written with AI assistance (Claude Code).
