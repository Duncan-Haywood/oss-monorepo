---
title: "Gradient compression costs loss in proportion to its variance, in a small DiLoCo experiment"
date: 2026-10-29
tags: [research, lowcomm-training, diloco]
description: "On a 413k-parameter GPT trained with DiLoCo, rand-k compression cost loss roughly in proportion to its variance factor omega = 1/p - 1."
---

In the lowcomm-training programme we train a tiny character-level GPT across four simulated workers that synchronise every H steps, with the updates sent through a random sparsifier that keeps a fraction p of coordinates. Theory says such a compressor adds variance proportional to omega = 1/p - 1. Does the loss penalty follow?

We ran 12 new runs (keep 1/8 and 1/32, H = 4 and 64, three seeds) and tested a rule fitted on two compression levels against the other two before looking. At H = 4 the excess validation loss over the uncompressed run was +0.009, +0.019, +0.040, +0.077 nats at omega = 3, 7, 15, 31. At H = 64 it was +0.010, +0.037, +0.099, +0.183. The linear rule missed by at most 0.017 nats, and fitted power-law exponents were 0.94 and 1.25.

So the penalty is roughly proportional to omega and grows with H, a little faster at H = 64 than linear. Limits: one compressor, one model, one corpus, three seeds, and the smallest cells sit at the seed noise floor. Log and code are in `research/lowcomm-training/LOG.md` (milestone 6c).
