---
title: "Hash commitments to training checkpoints cost the same share at any model size"
seo_title: "Cost of hash-committing training checkpoints"
date: 2026-11-08
tags: [research, verifiable-training, ml-security, cost-model]
description: "Hashing every checkpoint costs about 5 to 19 percent of step time on one CPU thread at any model size; the real bill is the worker's storage."
---

Spot-checking a worker's training run needs a commitment to its checkpoints. How much does that cost? Hashing is linear in parameters, and so is training compute, so the hash share of step time does not depend on model size. We measured SHA-256 on this container at about 1.3 GB/s on one thread. For fp32 weights and 2^20 tokens per step, hashing every step adds 4.9% of step time on a device doing 1e14 effective FLOP/s and 19% at 4e14. Committing every 5th checkpoint brings those to 1% and 3.8%.

Step time here is a FLOP model, not a measured run, and hashing can overlap with training or run on faster hardware, so treat these as single-thread upper figures. The verifier's side is tiny: 32 bytes per commitment. The bill falls on the worker, who must keep committed checkpoints to open sampled segments: 2.4 GB for a million-parameter model over 600 steps at s = 1, 168 TB at 70 billion parameters. That makes pricing recomputation on challenge the next step. Code and numbers are in `research/verifiable-training-mechanisms/experiments/commitment_cost/`.
