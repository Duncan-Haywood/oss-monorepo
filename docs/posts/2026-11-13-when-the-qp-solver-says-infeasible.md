---
title: "When the QP solver says infeasible: auditing 347 optimal power flow repair steps against a second solver"
seo_title: "PIPS vs Clarabel: spurious QP infeasibility in AC OPF repair"
date: 2026-11-13
tags: [research, grid-linopf, power-systems, optimization]
description: "Every QP of an AC OPF repair on 34 PGLib-OPF cases re-solved with Clarabel: PIPS was right when it answered, but failed on 26 solvable QPs."
---

The [`grid-linopf`](../../research/grid-linopf/PROPOSAL.md) research programme asks
whether a market's linear (DC) dispatch can be repaired to satisfy the real AC
power-flow limits cheaply. Its current method takes the plain DC dispatch,
linearises the AC power flow, solves a quadratic programme (QP) for the next
dispatch and voltage setpoints, and repeats for up to ten rounds. When the QP has
no point inside every limit, the method falls back to an *elastic* QP, where each
limit can be broken at a price, and then halves its step box.

The morning's milestone had found that the QP, solved by PYPOWER's PIPS
interior-point solver, takes 98 to 99 % of the run time. The obvious next step was
to make the QP smaller by keeping only the limits near their bounds, adding any
others the solution breaks and solving again. For a convex QP this
constraint-generation loop gives exactly the full QP's answer.

**The screened QP gave a different answer, and that was the finding.** On the
73-bus angle-limited case, PIPS had reported the full round-1 QP as failed. The
repair then ran on the elastic fallback every round and never got feasible. The
screened version solved the same QP to a point that breaks no limit. Since
the screened QP is a relaxation, the full one cannot have been infeasible. So we
wrote the predictions down and audited every QP the repair poses, 347 across the 34
benchmark cases, against Clarabel, an independent interior-point solver
([Goulart and Chen, 2024](https://arxiv.org/abs/2405.12762)).

What came back (`research/infra-dcopf/experiments/audit_qp.txt`):

- **When PIPS reports a solution, it is the right one.** Its objective
  matches Clarabel's within one part in a million on all 236 QPs both solve. The
  costs of every repair that finished are unchanged.
- **Its failures on hard QPs are mostly real.** Clarabel solves only 5 of the 75
  hard QPs PIPS gave up on. Usually the linear model really has no point inside
  every limit. (We had predicted at least half would be solvable; refuted.)
- **Its failures on elastic QPs mostly are not.** An elastic QP has a slack on
  every limit, so it is almost always feasible. PIPS failed 36 of 99, and
  Clarabel solved 26 of those. The other 10 all come from one case (the 300-bus
  congested one), where every solver failed.

Rerun with Clarabel on every QP, the repair is fully AC-feasible on **21 of 34**
cases (19 with PIPS), and on **31 of 34** with the voltage-only stage after it (29).
No case is lost, and the summed run time falls from 1,353 s to 260 to 277 s. That
is 4.9x in one run and 5.2x in a rerun, so our 5x prediction holds only within
timing noise. The screened PIPS solve also reaches 21. It is 3.0x faster but
inherits PIPS's elastic failures.

This is a solver result, not a better method, and it is one benchmark library at
one load point per case. Still, it moves two of the programme's misses from "the
method fails" to "the solver failed". It also gives a cheap check for anyone running
successive linearisation on top of an interior-point QP: re-solve the steps that
failed with a second solver before calling the linear model infeasible. The next
steps use Clarabel: the LPAC and optimised-linearisation baselines, and the held-out
500 to 2,000-bus cases.

Code, data and the pre-registered plan are in
[`research/infra-dcopf`](../../research/infra-dcopf/README.md) (`LOG.md`, 2026-11-13).
Produced with AI assistance (Claude).
