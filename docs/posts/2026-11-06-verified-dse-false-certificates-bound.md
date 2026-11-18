---
title: "When can a pilot wrongly certify zero regret? A short proof for chip-flow search"
seo_title: "False certificates in pilot-based chip-flow search: a bound"
date: 2026-11-06
tags: [research, chip-design, optimisation, theory]
description: "A distribution-free bound on how often a pilot's rank-displacement check wrongly certifies zero regret, checked on 40 cached cells."
---

In the `verified-dse` programme a successive-halving search cuts candidates on a cheap rung score. Zero regret is guaranteed if the best candidate is never ranked past the number of survivors. A pilot cannot see that rank for the unrouted optimum, so milestone 84 used the pilot's best routed point's rank as a stand-in and called "ratio below 1" a certificate. It was wrong about 4% of the time on 29 cells where the optimum fails the condition, with no explanation.

The explanation is short. Ratio below 1 forces the candidate to be ranked inside the last cut's survivor count, so at most k_last candidates (1 or 5 here) can carry it. A false certificate needs the pilot to contain one of them while the true optimum is not among them. So P(false) is at most 1 - C(n-g, m)/C(n, m), roughly m*g/n, with g the number of such candidates, using only rung scores.

Checked on the cached 40 cells: the set-size lemma holds in all 40, the empirical false rate never exceeds the bound at m = 8, 16 or 24, and g is 0 in 22 of the 29 cells, so no false certificate is possible there. The 4% comes from the other 7 cells. The bound says nothing about regret when the check does not fire, or how often a valid certificate is issued (0.49 to 0.85 of pilots in the 11 guaranteed cells).

Code, results and the proof sketch: `research/verified-dse/experiments/theory/pilot_rho_bound.py`, `LOG.md` milestone 90.
