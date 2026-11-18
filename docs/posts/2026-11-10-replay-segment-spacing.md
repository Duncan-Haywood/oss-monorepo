---
title: "Checking ML training by replay: why the segment spacing should be 20"
seo_title: "Verifiable ML training: segment length for replay audits"
date: 2026-11-10
tags: [research, verifiable-training, mechanism-design]
description: "Replay audits of outsourced ML training catch a stalled step at a rate set by the replay budget alone; measured fp16 drift caps segment length at 20 steps."
---

In the [verifiable training mechanisms](../../research/verifiable-training-mechanisms/)
programme a worker commits to a checkpoint every `s` steps and a verifier replays
`k` sampled segments. Two results from this week fit together.

- Replaying in fp16 drifts from the worker's float32 weights, and that drift
  stayed below the smallest step in its segment up to `s = 20` (worst ratio 0.48
  in 600 segments per cell) but not at `s = 40` (2.59; 1% of segments).
- The chance of catching a one-step stall depends only on the replay budget
  `B = k s` over training length `T`, not on `s` (simulated: 0.0321 to 0.0345
  against 20/600 = 0.0333).

So `s` only sets overhead, and with `K` the spacing at which checkpoints are
stored, the expected replay cost is `B((K/s - 1)/2 + 1)` steps. At `K = 100` and
`B = 20` that is 3.0 B-units at `s = 20` against 50.5 at `s = 1`, 16.8 times
less, for the same 24 GB of storage at a billion parameters.

Limits: one small MLP, plain SGD, and a hardware-noise model rather than real
mixed-precision kernels; the cost model counts steps only. Log entry:
[`LOG.md`](../../research/verifiable-training-mechanisms/LOG.md), milestone 74.
