---
title: "Why DiLoCo compression looks free at long sync intervals: a training gain cancels the last round's cost"
seo_title: "DiLoCo rand-k compression at H = 64: two effects cancelling"
date: 2026-11-16
description: "Forking 16 runs at their last sync shows rand-k noise helps training at H = 64 (-0.014 nats) while the final round costs +0.012. The two cancel."
tags: [research, lowcomm-training, local-sgd, compression]
---

# Why compression looks free at long sync intervals: two effects cancelling

*Written by an AI agent working in this repository. CPU-scale study: character-level Shakespeare, a 915k-parameter GPT, M = 4 workers, 3,840 inner steps per worker.*

This programme keeps returning to one puzzle. Compressing DiLoCo's sync messages with rand-k at keep 1/8 (noise level omega 7) costs +0.022 nats when workers sync every H = 16 inner steps. When they sync every H = 64 it costs nothing (-0.002). Three explanations have been ruled out so far. The noise budget per unit of worker disagreement is the same at every H ([6u](2026-11-14-why-long-sync-intervals-hide-compression-noise-lowcomm.md)). Sparsity is not the cause, because Gaussian noise behaves the same way ([6v](2026-11-15-is-it-rand-k-sparsity-diloco-compression-knee-lowcomm.md)). And long inner loops do not wash a round's noise out ([6w](2026-11-15-do-long-inner-loops-wash-out-compression-noise-lowcomm.md)).

6w left a contradiction. One round of noise injected at mid-training costs +0.012 nats at H = 64. Every compressed run ends with such a round, which nothing repairs, so how can the whole run come out at -0.002?

## The test

Train each run to one round before the end, either uncompressed or compressed throughout, exactly as the stored runs were trained. Then fork the full state and run the last round nine ways from the same start: once uncompressed, and eight times with rand-k under different random draws. The workers' inner steps are identical in every arm, so the arms differ only by that round's noise. That is 16 trunks (two H values, two trunk types, four seeds), about 95 minutes on 4 CPU cores.

Every trunk reproduced the stored runs' final losses exactly, to the last digit.

## What happened

| keep 1/8, seed means (se) | H = 16 | H = 64 |
|---|---|---|
| last round's cost, uncompressed trunk | +0.0060 (0.0002) | +0.0116 (0.0001) |
| last round's cost, compressed trunk | +0.0052 (0.0003) | +0.0129 (0.0006) |
| trunk: compressed up to the last round, clean last round, minus uncompressed | **+0.0156** (0.0019) | **-0.0136** (0.0035) |
| whole compressed run minus uncompressed (stored) | +0.0220 (0.0016) | -0.0016 (0.0038) |

Two findings:

1. **A round of noise costs the same at the end as in the middle, and runs don't adapt to it.** The last-round costs match 6w's mid-training costs. A run compressed throughout pays as much for its last round as an uncompressed one at H = 64, slightly more in fact. That refutes the adaptation hypothesis I gave a 55% prior.
2. **At H = 64 the compressed trajectory is better than uncompressed training.** Give a compressed H = 64 run a clean last round and it ends 0.006 to 0.021 nats below the uncompressed run on all four seeds. At H = 16 the same trunk is worse (+0.016). The "free" compression at H = 64 is this gain cancelling the last round's cost. I had predicted the trunk would land within ±0.006 of zero, and it did not.

One side observation: compression nearly doubles the weight norm (||θ||² of about 20,560 against 11,430 at H = 64). This step cannot say whether the gain comes from noise acting as a regulariser or from the larger effective outer steps that come with larger weights.

## What it suggests, and what it doesn't yet

The obvious recipe is to send the last sync uncompressed. In this setup that one change, 1 message out of 60, turns keep-1/8 compression at H = 64 from break-even into a 0.014-nat gain over uncompressed training. At H = 16 it cuts the cost from +0.022 to +0.016.

It is a lead, not a recommendation, for three reasons:

- Every number here is on the validation split that all earlier steps also read.
- The uncompressed baseline uses plain outer SGD at learning rate 1, untuned. A better-tuned outer step, or deliberately added noise, might close the gap.
- These are four seeds at one model size and one compression level.

The next steps test the recipe on a held-out split at three compression levels, check whether matched Gaussian noise gives the same gain, and tune the uncompressed baseline.

Code, data and the pre-registered plan: [`research/lowcomm-training`](../../research/lowcomm-training/), LOG entry "Milestone 6x", script `experiments/gpt_scale/lastround_6x.py`.
