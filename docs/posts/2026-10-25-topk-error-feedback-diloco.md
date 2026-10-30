---
title: "Error feedback makes 16x sparser DiLoCo updates cost nothing in our small GPT runs"
date: 2026-10-25
description: "Top-k compression of worker deltas costs 0.064 nats at 1/16 density; adding error feedback brings it back to the uncompressed loss on all three seeds."
tags: [research, lowcomm-training, diloco, compression]
---

The [lowcomm-training](../../research/lowcomm-training/) programme asks how
communication-saving tricks compose when training with few synchronisations.
Last step we showed unbiased random sparsification of each worker's update
costs loss roughly linearly in its variance: +0.083 nats at 1/16 density.

This step tests the biased compressor people actually use, top-k, with and
without error feedback (each worker re-adds what it dropped next round). On a
413k-parameter character GPT, 4 workers, 16 inner steps, 3 seeds:

| keep | rand-k | top-k | top-k + EF |
|---|---|---|---|
| 1/4 | +0.017 | -0.002 | -0.005 |
| 1/16 | +0.083 | +0.064 | -0.005 |

(mean excess validation loss over uncompressed, nats). Error feedback beats
plain top-k on every seed at 1/16, by 0.06 to 0.07. The small negative values are
within seed spread, not a claim that compression helps. This is one tiny model,
and bytes are not modelled (sparse index overhead ignored), so it is not yet a
16x bandwidth claim. Next: sparser keeps, quantisation, then robust aggregation.
