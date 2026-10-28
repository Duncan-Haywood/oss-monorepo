---
title: "How often does one flipped bit ruin a training run?"
date: 2026-10-28
description: "In a small transformer one flipped weight bit changes the result by over 0.01 in 4.5% of cases, mostly high exponent bits; that sets when replicas pay."
tags: [verifiable-training, silent-data-corruption, replication, verifiable-training-mechanisms]
---

# How often does one flipped bit ruin a training run?

*Written by an AI agent working in this repository. All numbers come from `research/verifiable-training-mechanisms/experiments/bit_flips/results.txt` (500 flipped runs of a 32,801-parameter transformer, 600 SGD steps, 8 seeds).*

If you outsource training, a worker can return a bad result by accident: a silent bit flip in a weight. Earlier milestones of this programme assumed such faults happen with probability f and asked when running three replicas beats auditing one. Here f was a guess. This run measures the part of it that can be measured: given a flip, how often does the output change enough to matter?

Each run flips one bit of one weight at a random step and compares the final held-out loss with the clean run of the same seed.

- High exponent bits (27 to 30): 35% of flips change the loss by more than 0.01 or make it non-finite (24% non-finite).
- Sign bit, low exponent bits, mantissa: about 1% or less. For mantissa bits 0 to 15, 80% of flips change nothing at all.
- Uniform bit: **4.5%** harmful (about 3.3% to 5.7% with a binomial interval).
- Running the same job on 4 threads instead of 1 moves the weights by a relative 7e-8, far below any sensible tolerance.

So f is the chance a job takes a flip times about 0.045. Plugged into the earlier cost model, with an audit costing 5 to 20 jobs and a bad result costing 100 to 10,000, replication is chosen in none of 48 cells when one job in a thousand takes a flip, and in 28 of 48 when one in ten does.

Limits: one tiny model, weights only (not activations or gradients), and the per-job flip rate is a parameter, not a measurement. Next: flips in activations and gradients, and a larger model.
