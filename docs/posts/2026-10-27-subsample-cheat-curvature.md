---
title: "A cheating trainer's error sits where the loss is steep"
date: 2026-10-27
description: "In the verifiable-training programme, the harmful part of a subsample cheat's gradient error has curvature about 320 times a random direction's, and close to the honest gradient's own."
tags: [verifiable-training-mechanisms, research, training-verification]
---

[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) asks how outsourced ML training can be checked. One cheat computes the gradient on a quarter of the batch and hopes the referee's norm test lets it through. Milestone 28 showed its damage comes from the error component orthogonal to the honest gradient. Milestone 29 asks why that component hurts.

On a small transformer (10 seeds, 600 steps) we measured the Hessian curvature along the accepted error with double backprop. The orthogonal error has Rayleigh quotient about 1.0, against 0.003 for a random direction (ratio about 320, interval 297 to 360), 18% of the top eigenvalue, and 75% to 87% of the honest gradient's own. So the error is not isotropic noise: it lies in the same stiff directions as the gradient.

Two honest limits. The random baseline is nearly trivial in 10^5 dimensions, so the gradient comparison is the informative one. And this is correlation: the causal test (random error with matched curvature) is next. Details and the log: `research/verifiable-training-mechanisms/LOG.md`, milestone 29.
