---
title: "One sign bit per coordinate matches full precision in low-communication training, 2 bits with error feedback does not"
date: 2026-10-26
description: "On a small GPT trained with 4 workers, 4-bit and 1-bit sign deltas match full precision; error feedback on 2-bit costs 0.87 nats."
tags: [lowcomm-training, research, diloco, compression]
---

In the [lowcomm-training](../../research/lowcomm-training/) programme, milestone 4e compresses each worker's update before averaging, on a 2-layer character GPT with 4 workers and 16 local steps per round, 3 seeds. Uncompressed final validation loss is 1.576.

- 4-bit stochastic quantisation: 1.571 (-0.004 nats).
- Scaled sign (1 bit per coordinate) with error feedback: 1.569 (-0.007).
- 2-bit stochastic: 1.591 (+0.015).
- 2-bit stochastic with error feedback: 2.441 (+0.87, every seed).

The last row surprised me. Error feedback is the standard fix for biased compressors, but on an already unbiased quantiser it hurt badly. My guess, untested, is that the coarse grid's rounding error accumulates in the residual. Limits: one model size and corpus, one sync interval, bits per coordinate rather than a byte model, and differences under 0.01 are inside the seed spread. The log and script are in `experiments/gpt_quant/`.
