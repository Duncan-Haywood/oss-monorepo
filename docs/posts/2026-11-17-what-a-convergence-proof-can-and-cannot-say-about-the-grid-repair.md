---
title: "What a convergence proof can and cannot say about the AC repair of a DC dispatch"
seo_title: "Convergence of a successive linearisation AC OPF repair, checked"
date: 2026-11-17
tags: [research, power-systems, optimal-power-flow, pglib-opf, convergence, grid-linopf]
description: "A step-based convergence statement for the AC repair of a DC dispatch, checked on 31 PGLib-OPF traces: halvings stay logarithmic, accepted steps are unbounded."
---

The `grid-linopf` programme repairs a market's linear (DC) dispatch so it satisfies the AC power-flow physics. Each round linearises the power flow, solves a QP inside a trust box with a small margin inside every limit, and runs one AC power flow. Four days ago we tested the convergence bound in the proposal against round-by-round traces of 34 PGLib-OPF cases, and it [failed badly](2026-11-13-the-grid-repair-needed-more-rounds-not-a-better-model.md). It divided the initial violation by the smallest merit decrease, and that put it up to 55,000 times above the observed round count. This run replaces it with a statement about steps instead of merit, proves it, and checks it on the same traces. We wrote the predictions down before running the check ([log](../../research/infra-dcopf/LOG.md)).

**The statement** ([theory.md](../../research/grid-linopf/theory.md)) needs two assumptions. The power flow is smooth along each step (nonsingular Jacobian), and every round's hard QP (no slack variables) is feasible. Given those:

1. A hard step shorter than a curvature radius r* always finishes the repair. Every limit's linearisation error is then smaller than its margin.
2. The trust box is halved at most log₂(box size / r*) times, because once the box is smaller than r*, the next round is clean.
3. The round count is 1 + (accepted rounds that are not yet clean) + (halvings). The repair stops whenever its accepted steps shrink, but nothing in the assumptions bounds how many accepted steps it takes. The QP minimises cost, so the cost gradient pulls each accepted step to the edge of the box.

**What the traces say**, on the 31 cases that finish within 30 rounds:

| Check | Prediction | Result |
|---|---|---|
| halvings never exceed the bound | held on all 15 all-hard finishers | held |
| the halving bound is small (≤ 12) | bound 1 to 12, observed 0 to 5 | held |
| most repairs finish with a step longer than r* | 27 of 31 do | held |
| steps shrink before the finish | 28 of 28 (median 10x smaller) | held |
| round 1's curvature predicts the path's | 15 of 39 hard rounds inside its radius end clean | refuted |
| path length / r* counts the accepted rounds within 10x | 3 of 30 | refuted |
| case73 API's stall comes with steps that fill the box | 0.26 to 0.36 of the box | refuted |

So the part we can prove up front, the halvings, is small and logarithmic. Most of the rounds, though, are accepted, cost-driven steps: 162 of the 228 misses. The proof says nothing about how many of those there will be, and the traces show they are a median 24 times longer than the radius that guarantees a finish. A bound on them would need a change to the method, for example a trust box tied to the current violation. That has to be tested on held-out cases before anyone relies on it.

The last row corrects an earlier claim. On 2026-11-13 we read case73 API, which stalls with a well-conditioned Jacobian, as a stationary point of the infeasibility: a place where no small step can reduce the violation. If that were true, the QP's elastic fallback (the version that lets limits be broken at a penalty) would return a zero step. It doesn't. Over the last 10 rounds the step stays about a third of the box while the box halves 250-fold, so the QP keeps finding a direction. The stall more likely comes from the acceptance test: the merit that decides whether a step is kept weighs the rows differently from the QP's penalty. That was an inference from a flat merit, and the trace does not support it. We have withdrawn it until the elastic QP's own penalty is logged.

**Also fixed:** the proposal cited Fletcher and Sainz de la Maza (1989) with the wrong DOI. The paper is [10.1007/BF01582292](https://doi.org/10.1007/BF01582292).

Numbers: [`results_theory.txt`](../../research/infra-dcopf/experiments/results_theory.txt). Programme page: [grid-linopf](https://marisstella.app/research/grid-linopf/). Written with AI assistance (Claude Code).
