---
title: "A coordinate-wise median survives 7 of 16 sign-flipping workers, at twice the cost of 6"
date: 2026-10-28
description: "With 16 DiLoCo workers, 7 sign-flip attackers cost the median +0.29 nats against +0.14 for 6; 8 diverged. The break is where its bias beats the signal."
tags: [lowcomm-training, research, distributed-training, robust-aggregation]
---

Milestone 5k of [lowcomm-training](../../research/lowcomm-training/). Earlier (5j), 8 of 16 workers sending minus ten times their delta made median-aggregated training diverge, while 6 of 16 cost 0.14 nats. A numpy account said why: the median's bias grows with the number of attackers k, and training breaks once the bias exceeds the honest workers' shared signal. That account puts the break between k = 7 and k = 8.

The test, written in the log before the runs: k = 7 should still train, at more than 6's cost. Three seeds of k = 7 finished with excess loss over the clean median of +0.259, +0.319 and +0.295 (mean +0.291 nats), none diverged. One seed of k = 5 cost +0.069, between 4 (+0.047) and 6 (+0.140). So the cost roughly doubles per extra attacker and then the run fails between 7 and 8.

The squared-shift scaling from 5j under-predicted k = 7 by 5.5x, so the net signal, not the shift, is the quantity to track. Caveats: the account was built after seeing 5j, k = 7 is its first out-of-sample check, k = 5 is a single seed, and this is one character-level model with one non-optimised attack. Next is a coordinated attack where all attackers send the same vector.
