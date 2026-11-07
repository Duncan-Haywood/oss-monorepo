---
title: "How often does a 16-point pilot certify that a cheap chip-flow rung is safe? An exact formula"
date: 2026-11-07
description: "For the verified-dse programme, the chance that a pilot's rank-displacement certificate fires has an exact tie-aware formula that matches simulation in all 33 test cells."
tags: [research, chip-design, verified-dse]
---

When a search over open-source chip flows uses a cheap rung to prune candidates, a small pilot of fully routed points can certify that the cut is safe. Earlier milestones bounded how often a certificate is wrong. This one answers how often a valid certificate is issued at all.

The certificate fires exactly when the pilot's best point (by final result) is one of the few candidates the cheap rung ranks well enough to be safe. With ties in the final result, which every guaranteed cell has, the probability is a sum over tie groups of binomial-coefficient ratios. Enumerating every pilot of 60 small tied instances matches the formula, and against 300 random pilots in 33 cell and pilot-size combinations none is beyond 3 binomial sigma (max |z| 2.32). Median power is 0.51, 0.73 and 0.88 at 8, 16 and 24 points. The earlier tie-free version was wrong in principle.

Limits: the formula needs the final result for the whole pool, so it picks a pilot size when evaluating, not inside a live search; it covers one cached 40-cell table. Code and tests are in `research/verified-dse/experiments/theory/pilot_rho_exact.py`; the paper's Section 4 now carries it.
