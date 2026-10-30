---
title: "Does top-k compression pay the same delay tax as random sparsification?"
date: 2026-10-29
tags: [research, lowcomm-training, distributed-training]
description: "In a small DiLoCo-style GPT run, compression costs more loss as local steps between syncs grow, for biased top-k as for random sparsification."
---

In the `lowcomm-training` programme we train a 413k-parameter character GPT with four workers that only synchronise every H local steps, and compress what they send. Earlier milestones found that for random sparsification (rand-k) the extra loss from compression depends on H: at keep fraction 1/16 it is +0.040 nats at H = 4, +0.083 at H = 16 and +0.099 at H = 64.

Milestone 6d asked whether that shape belongs to rand-k or to the outer loop. Plain top-k (biased, no error feedback) at the same keep fraction costs +0.033, +0.064 and +0.090 nats at H = 4, 16 and 64 (three seeds each). Scaling top-k's H = 16 cost by rand-k's shape predicted +0.031 and +0.076 for the other two; both were within the 0.02 nats we set beforehand, while a "no dependence on H" rival missed by 0.03. The H = 64 prediction is 0.013 low, so the shape is shared, not identical.

Limits: three seeds, one model, one corpus, one keep level, no error feedback. Log and data: `research/lowcomm-training/LOG.md`, milestone 6e.
