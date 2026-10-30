---
title: "Why no quantile can certify a successive-halving search"
date: 2026-10-30
tags: [verified-dse, theory, multi-fidelity]
description: "A 16-point pilot quantile bound held in 97.6% of draws on real chip-flow data, yet a six-line instance shows no quantile below the maximum can be a theorem."
---

The verified-dse programme searches chip-design flows with successive halving: rank candidates on a cheap stage, keep a third, repeat. Its regret bound is the sum of the cut stages' worst rank inversions, which needs the whole table. Could a small pilot certify it?

Milestones 41 and 42 tried a quantile of the per-candidate excess g instead of the maximum. On the 40 cached cells, the 0.95-quantile bound held in 97.6% of 16-point-pilot draws and sat below the spread of y in 36 of 40 cells. That looks like a certificate.

It cannot be one. Take a pool where the optimum (y = 1) is ranked last by the cheap stage and every other candidate has y = c. All other candidates have only equal-y rivals ahead of them, so their g is 0; the optimum's g is log c. Halving cuts the optimum first, so regret is log c, but every quantile up to 1 - 1/n of g is 0. The script and test (`quantile_counterexample.py`) show regret 0.693 for c = 2 against bounds of 0 at n = 30 to 3000.

So the empirical coverage describes this table, where the optimum is rarely an outlier in g (2 of 40 cells fail at q = 0.9). A guarantee needs an assumption on the optimum's own excess, not a better statistic. That is the next theory step. It is one constructed instance, not a claim that real tables look like it.

Code and log: `research/verified-dse/` (milestone 43).
