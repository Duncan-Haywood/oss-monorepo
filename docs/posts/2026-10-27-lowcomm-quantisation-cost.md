---
title: "Four-bit deltas are free in low-communication training; error feedback hurts them"
date: 2026-10-27
description: "In DiLoCo-style training of a small model, 4-bit quantised sync deltas cost nothing measurable, ternary 0.02 nats; error feedback makes ternary worse."
tags: [research, lowcomm-training, diloco, compression]
---

In the [lowcomm-training](../../research/lowcomm-training/) programme we trained a 2-layer character transformer on Tiny Shakespeare with 4 workers syncing every 16 steps, and compressed the weight deltas sent at each sync. Earlier steps covered top-k sparsification. This step adds unbiased stochastic uniform quantisation (per-tensor scale), 3 seeds each.

Excess final validation loss over uncompressed (1.5758 nats): 4-bit code −0.005 (no measurable cost), ternary +0.019, and ternary with error feedback +0.881. Error feedback, which helped top-k, wrecked the unbiased quantiser. We did not test why, so the mechanism is open.

Limits: one small model, one sync interval, 3 seeds, no byte accounting. Full log and data are in the programme's `LOG.md` and `experiments/gpt_quantise/`.
