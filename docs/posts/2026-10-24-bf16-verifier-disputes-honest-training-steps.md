---
title: "A bf16 verifier disputes 41% of honest training steps at a 1e-3 tolerance"
seo_title: "A bf16 verifier disputes 41% of honest training steps"
date: 2026-10-24
description: "Measured on a small transformer: the tolerance that keeps an honest worker safe on bf16 hardware already lets a cheater skip 16% of steps for 0.2 std of loss."
tags: [research, verifiable-training, transformers]
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/)
programme asks how a requester can check outsourced training. A verifier
re-runs a step and disputes it if the update differs by more than a tolerance
tau. We measured that tolerance on a 30k-parameter character transformer
(10 seeds, 600 steps, bf16 autocast referee).

- Honest bf16 drift per step: median 8.5e-4, p99 2.4e-3, max 4.0e-3. At
  tau = 1e-3, 41% of honest steps would be disputed; at 1e-2, none.
- A cheater who skips every step whose update is at most tau skips 16% of steps at
  tau = 1e-2, and the held-out loss rises by 0.0017 (95% CI 0.0011 to 0.0022), about
  0.2 seed std.

So the tolerance an honest worker needs on bf16 hardware is already one at
which skipping work is nearly free. Limits: tiny model, fixed data split, skip
shortcut only, CPU autocast rather than a second accelerator. Log, code and
results: `experiments/transformer_bf16/` in the programme directory.
