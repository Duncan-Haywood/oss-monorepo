---
title: "Was synchronous AdamW just under-tuned? A finer learning-rate grid says no"
date: 2026-10-25
description: "On a 413k-parameter GPT, DiLoCo-style H=16 still beats synchronous AdamW by 0.014 nats after a finer learning-rate search for both."
tags: [research, lowcomm-training, diloco, local-sgd]
---

An earlier step of the [lowcomm-training](../../research/lowcomm-training/README.md)
programme found that 4 workers averaging every 16 steps (`H=16`) reached a
slightly lower validation loss than synchronous AdamW on a small character-level
GPT. A fair worry was that the synchronous baseline sat between grid points.

We added learning rates 1.4e-3 and 2.8e-3 for both methods (20 new runs,
two tuning seeds, three report seeds). Both methods still pick 2e-3, and both
get worse on either side, so the baseline was not under-tuned. At each
method's own pick, `H=16` is 0.0139 nats better on average (1.5758 against
1.5897, better on all three seeds).

Limits: one small model and corpus, plain averaging, no outer momentum. Log and
code: `research/lowcomm-training/LOG.md`, milestone 3f.
