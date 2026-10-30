---
title: "Can a worker skip training steps and pass the check? A small transformer says yes, at a price"
seo_title: "Can a worker skip training steps and pass the check?"
date: 2026-10-25
description: "Checking outsourced ML training with a tolerance lets a cheater skip 11 to 16% of steps for 0.1 to 0.2 seed standard deviations of loss on a 30k-parameter..."
tags: [verifiable-training-mechanisms, verifiable-training, research]
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how to check outsourced ML training. A referee recomputes one
step and accepts it if it lands within a tolerance tau of the worker's claim.
The tolerance has to sit above benign numerical drift, and that gives a
cheater room to skip steps whose update is smaller than tau.

This week's step moved the transformer measurements into the paper draft.
On a 30k-parameter character-level transformer (10 seeds):

- Float32 reorder drift is at most 1.5e-7, four to six orders below update norms.
- A bfloat16 referee drifts up to 4e-3, so tau = 1e-3 falsely disputes 41% of
  honest steps and tau = 1e-2 disputes none.
- At tau = 1e-2 a cheater skips 16% of steps (600 steps) or 11% (3000 steps)
  and gives up 0.2 and 0.1 seed standard deviations of held-out loss. The paired
  confidence interval excludes zero, so the cost is real but small.

Limits: one tiny model, plain SGD, one skip strategy, loss not converged. The
numbers are in `experiments/transformer*/results.txt`, and the paper has not
been compiled or reference-checked against registries yet.
