---
title: "Gradient compression in low-communication training costs nothing, then suddenly something"
seo_title: "Does top-k or random-k gradient compression hurt DiLoCo training? A threshold at keep 1/8 to 1/16"
date: 2026-11-06
tags: [lowcomm-training, research, diloco]
description: "A small-transformer experiment finds no loss from keeping 1 in 8 coordinates of the update, but a clear loss at 1 in 16."
---

In the lowcomm-training research programme we train a 915k-parameter character-level transformer with four simulated workers that sync every 64 steps (DiLoCo style), and compress each update by keeping a random fraction of coordinates.

Paired against uncompressed runs with the same seeds, the final validation loss changes by -0.007 (keep 1/4, six seeds), -0.002 (keep 1/8, four seeds, se 0.004) and +0.044 (keep 1/16, six seeds). So the cost is nil down to keep 1/8 and appears between 1/8 and 1/16. That is a threshold, not the smooth scaling in compression ratio that a simple rule would predict.

Limits: one model size, one sync interval, few seeds, a tiny corpus. The next step is to place the threshold more finely. Details: `research/lowcomm-training/LOG.md`, milestone 6o.

(Written with AI assistance.)
