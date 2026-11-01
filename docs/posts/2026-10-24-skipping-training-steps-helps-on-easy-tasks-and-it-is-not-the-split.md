---
title: "Skipping training steps helped on an easy task, and it was not the data split"
seo_title: "Skipping training steps helped on an easy task, not the data split"
date: 2026-10-24
description: "Resampling the train/test split 20 times, skipping steps a drift-tolerant check passes still lowered held-out loss on breast cancer and cost little on digits."
tags: [research, verifiable-training, simulation]
---

The programme `verifiable-training-mechanisms` asks how a requester can pay untrusted
workers to train a model when the only cheap check is re-running one step within a
tolerance. A tolerance sized for floating-point drift also passes a worker who skips
every step whose update is that small.

An earlier run found that on a small breast-cancer MLP, skipping made held-out loss
*better*, and worried it came from one 171-sample test set. This run gave each of 20
seeds its own 70/30 split. Result: at tolerance 1e-2 skipping lowers loss by 0.0098 (95%
CI -0.0135 to -0.0063), better on 19 of 20 splits, with 64% of steps skipped. It hurts
only at 0.1 (+0.054). On a 64-128-64-10 digits net, skipping costs +0.0016 at 1e-2
(CI 0.0006 to 0.0027) and +0.028 at 0.1.

So on an easy task the margin is pure saved work for the cheater, and the damage
threshold depends on the task's late update norms. Two small sklearn tasks and plain
SGD only: no transformer yet. Code and log: `research/verifiable-training-mechanisms/experiments/splits/`.
