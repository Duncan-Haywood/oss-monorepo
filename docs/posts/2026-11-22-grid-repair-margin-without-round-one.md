---
title: "Dropping one round fixes a learned grid margin's only loss, and it still fails held-out adoption"
seo_title: "OPF repair: a learned thermal margin without round 1"
date: 2026-11-22
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Rule K1 ignores the unboxed first round: 32 of 34 development PGLib cases repaired with none lost, but held-out stays 10 of 19 and costs +0.65 points."
---

This morning's [rule K](2026-11-22-learned-thermal-margin-grid-repair.md) learned a per-branch safety margin from the AC power flow's own errors. It finished a case no earlier rule had, case118 API, and lost one the frozen repair finishes, case240 SAD. The loss had a clear cause. Round 1 of the repair has no trust box on generator output, so the step is large and so is the error. Six rows on case240 SAD learned a margin from that one big step, sat at the 5 % cap, and left every later boxed QP with no feasible point.

**Two fixes, fixed in advance.** Both were written into the [log](../../research/infra-dcopf/LOG.md) with priors before anything was scored:

- **K1** never learns from round 1.
- **Kr** learns from round 1 but shrinks the error by the square of how far the step overshot the first box. A second-order error scales with the step squared.

Everything else is rule K. On the 15 cases where rule K never learned on round 1, both variants reproduce its run exactly, which checks the code.

**What came out** (PGLib-OPF cases, PYPOWER power flows):

| | frozen | rule K | **K1** | Kr |
|---|---|---|---|---|
| development finishers, 34 cases | 31 | 31 | **32** | 31 |
| held-out finishers, 19 cases of 500 to 2,000 buses | 10 | 10 | **10** | 10 |
| held-out, mean cost change where it and frozen both finish | | +0.47 | +0.65 | +0.46 |

- **The diagnosis was right.** With round 1 ignored, case240 SAD finishes at round 20, the frozen repair's round, at +0.38 % over the AC optimum. case118 API stays finished (round 28, +0.65 %). K1 loses no development finisher. It is the first variant of this rule that improves on the frozen repair without a loss, and on development it barely moves the cost (+0.03 points on average).
- **Rescaling is not as good as dropping.** Kr also brings case240 SAD back, but it loses the case118 API finish.
- **Held out, it buys speed, not finishes.** Of the 9 cases where K1 and the frozen repair both finish and the round counts differ, K1 is sooner on 8 (median 3 rounds; sign test P = 0.039). It pays +0.65 cost points on average, up to +2.2. None of the five overload stalls finishes. The three 1,354-bus PEGASE cases end 1 to 2 overloads short, at 108 to 117 % of rating.

The adoption test fixed before the run needed no development loss *and* a held-out net gain. K1 meets the first and not the second, so the frozen repair stays.

**What a practitioner can take from it.** If you learn per-line offsets from AC feedback while correcting a linear dispatch, do not learn from a step you will never take again. Here, one excluded round turned a mixed result into a clean development gain. Expect the offsets to get you to a feasible point sooner and at a higher cost. That is why the programme's next step is a cost phase that starts from the first clean point and keeps it clean while lowering the cost.

Code and numbers: [`run_kfirst.py`](../../research/infra-dcopf/experiments/run_kfirst.py), [`results_kfirst.txt`](../../research/infra-dcopf/experiments/results_kfirst.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
