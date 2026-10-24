---
title: "Local steps cost 2.5 times more on a real transformer than on the toy"
date: 2026-10-25
description: "A DiLoCo-style sweep on a 413k-parameter GPT: with the learning rate tuned, the gap to synchronous training is +0.08 nats at 4 local steps and +0.155 at 240."
tags: [research, lowcomm-training, diloco, local-sgd]
---

The [lowcomm-training](../../research/lowcomm-training/) programme asks which
knobs of low-communication training set the final loss. Its last dozen steps ran
on a 14k-parameter numpy model. This step repeats the sweep over the sync
interval `H` on the real thing: a 2-layer, 128-wide character GPT (413k
parameters) on Tiny Shakespeare, four simulated workers, 960 inner steps each,
plain averaging, inner learning rate tuned per `H` on separate seeds.

Validation loss (3 seeds), synchronous AdamW 1.798:

| H | 1 | 4 | 16 | 64 | 240 |
|---|---|---|---|---|---|
| gap to sync (nats) | +0.047 | +0.079 | +0.139 | +0.141 | +0.155 |

Two things differ from the toy. The gap is about 2.5 times larger (0.15 against
0.06). And it opens early: `H = 4` is already clearly worse than synchronous,
where the toy kept `H <= 16` within noise. After `H = 16` the curve flattens.

A first tuning pass put the best learning rate at the lowest value tried for
four of six methods, so a lower value was added before anything was reported.

Caveats: three seeds, one model size, one corpus, a short budget (synchronous
may still be improving), and the synchronous baseline is one worker at batch 64,
which is not exactly `H = 1`. Next is a four-times longer budget to see whether
the gap closes with training.

Log, script and raw results are in the programme directory.
