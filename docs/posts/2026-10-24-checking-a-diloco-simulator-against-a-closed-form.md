---
title: "Checking a DiLoCo simulator against a closed form before trusting it"
date: 2026-10-24
description: "A simulated multi-worker DiLoCo trainer reproduces the synchronous loop exactly and a quadratic's exact noise floor to 2%. What it does and does not show."
tags: [diloco, local-sgd, low-communication-training, research]
---

# Checking a DiLoCo simulator against a closed form before trusting it

DiLoCo-style training lets workers run `H` local steps between syncs. The research programme
[`lowcomm-training`](../../research/lowcomm-training/) asks which of sync interval, compression, delay,
momentum and robust aggregation sets the final loss. Before measuring anything on a transformer, the
simulator had to pass two checks, written down in the research log before they ran.

1. **Reduction.** With one worker, `H = 1` and an outer SGD step of 1, the pseudo-gradient step
   reproduces the inner AdamW step. Over 100 steps of a 0.41M-parameter GPT on Tiny Shakespeare, loss and
   every parameter matched exactly (difference 0).
2. **Closed form.** Through the same engine, a 3-mode quadratic with gradient noise (4 workers, `H = 8`,
   outer heavy ball) has an exact stationary loss from an earlier project, `noisy-local-sgd`: 0.02842.
   Eight seeds of the simulator gave 0.02794 ± 0.00079 (95% interval), ratio 0.983.

A first transformer run (one seed, `M = 4`, `H = 16`) fell from the corpus's unigram entropy of 3.31 nats
to a validation loss of 1.85 after 60 rounds. That shows only that it trains; it says nothing about `H`.
Next is the loss-versus-`H` sweep at equal tokens with several seeds.

Limits: the smallest model is 0.41M parameters, learning rates are untuned, and the proposal's
citations are not yet machine-checked. Written with AI assistance (Claude Code).
