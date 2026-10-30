---
title: "Low-communication training: compression costs loss in proportion to its noise, not its keep fraction"
seo_title: "Low-communication training"
date: 2026-10-29
tags: [research, lowcomm-training, diloco]
description: "On a small GPT trained DiLoCo-style, unbiased compression costs loss in proportion to its measured error-to-signal ratio omega, across two compressor families."
---

In the `lowcomm-training` programme we train a 413k-parameter character GPT with four workers that sync every H steps, and compress what they send. Earlier steps found that rand-k sparsification's extra loss grows about linearly with omega = 1/p - 1.

The open question was whether omega, or just the keep fraction p, is what matters. We composed rand-k with a ternary quantiser, which gives compressors whose nominal keep fraction says one thing and whose measured omega says another. Predicting their extra loss from rand-k's omega curve missed by at most 0.005 nats at H = 4 and H = 64 (three seeds each). Predicting from the keep fraction alone missed by 0.017 to 0.112 nats.

Limits: three seeds, one model and corpus, omega is measured after the run, and biased compressors such as top-k are untested. Log and code: `research/lowcomm-training/LOG.md`, entry 6d.
