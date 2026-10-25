---
title: "Throwing away most of a DiLoCo update costs loss in a straight line"
date: 2026-10-25
description: "Sending a random fraction of each DiLoCo update costs validation loss almost exactly linearly in the compressor's variance factor (R² 0.999)."
tags: [research, diloco, training]
---

We trained a 413k-parameter character-level GPT on Tiny Shakespeare with four simulated DiLoCo workers syncing every 16
steps, and made each worker send only a random fraction of its update (rescaled so the average stays unbiased).

Against full updates (validation loss 1.5758 nats, three seeds), keeping 1/2 of the coordinates cost +0.006, 1/4 cost
+0.017, 1/8 cost +0.042 and 1/16 cost +0.083. The excess is almost exactly linear in the compressor's variance factor
(R² 0.999, log-log slope 1.26), as the theory in our low-communication-training programme predicts.

Caveats: three seeds, one model size and corpus, random sparsification only (no quantisation or error feedback), and we
did not weigh the loss against the bytes saved. Next: quantisers and top-k with error feedback on the same grid.
Code, log and numbers: `research/lowcomm-training`. Written with AI assistance.
