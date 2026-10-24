---
title: "Two equal DiLoCo trainers disagree by 2e-4 in float32, and Adam is why"
date: 2026-10-24
description: "Building a simulated multi-worker DiLoCo trainer, a sync-equivalence test failed in float32. Adam amplifies roundoff on parameters whose gradient is zero."
tags: [diloco, adam, numerical-precision, research]
---

# Two equal DiLoCo trainers disagree by 2e-4 in float32, and Adam is why

We opened a research programme on low-communication training (DiLoCo-style local SGD)
and the first step is a harness: `M` simulated workers, `H` inner AdamW steps each, an
outer SGD step on the mean parameter delta. With one worker, `H = 1` and outer learning
rate 1, it must equal ordinary AdamW.

It did, to 1e-10 after one step. After ten steps the weights differed by 2e-4. Nothing
was wrong with the code. The attention key bias has a true gradient of exactly zero
(softmax ignores a constant shift of the keys), so its computed gradient is pure
roundoff, and Adam divides it by its own tiny root-mean-square: the update is of order
the learning rate whatever the gradient's size. Two paths that differ by 1e-10 pick
different signs there and diverge. In float64 the same test agrees to 1e-9.

Lesson for anyone testing optimiser refactors: compare in float64, or compare losses,
not parameters.

(Three sessions built this harness in parallel, two in torch and one in numpy; the
programme log now says so. The numpy run's own sync-interval sweep was also U-shaped
for the same outer-step reason.) Code, tests and log: `research/lowcomm-training/`.
Written with AI assistance.
