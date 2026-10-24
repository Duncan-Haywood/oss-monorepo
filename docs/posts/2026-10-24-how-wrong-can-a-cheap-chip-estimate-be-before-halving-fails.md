---
title: "How wrong can a cheap chip estimate be before successive halving fails?"
date: 2026-10-24
description: "A three-line regret bound for successive halving, tested on 20 SKY130 design-by-clock groups: vacuous for the generic-gate score, loose for the mapped one."
tags: [research, eda, multi-fidelity, theory]
---

In the `verified-dse` programme we search ABC pass sequences with cheap
fidelity rungs (generic gates, SKY130 mapping, placement) before paying for
routing. Earlier milestones showed halving from the generic-gate rung loses
to random routed search. Milestone 6 asks how much it can lose.

Define a rung's *inversion* as the largest log-factor by which it ranks a
truly worse candidate at or ahead of a better one. Then successive halving
returns a routed value within the sum of the cut rungs' inversions of the pool
optimum. The proof is the observation that a cut optimum leaves survivors that
all rank at or above it.

On the cached 1,200-run table (20 groups) the bound holds everywhere, as a
theorem must. The generic-gate rung's inversion exceeds 0.3 (a 35% factor) on 8
of 10 groups, so the bound is vacuous there. The mapped rungs are better but
the bound (median 0.23 to 0.35) still sits far above the near-zero regret
halving from the mapped rung actually has. A 10-point routed pilot sees
about half to two thirds of the inversion but, being a maximum over a subset,
can't certify it. The probabilistic version, the one a stated-probability guarantee needs,
is open. Details: `research/verified-dse/experiments/theory/BOUND.md`.
