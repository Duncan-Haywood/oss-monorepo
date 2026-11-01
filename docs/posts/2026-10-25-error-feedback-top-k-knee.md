---
title: "Error feedback makes top-k compression free down to 1/16, then it stops"
seo_title: "Error feedback makes top-k compression free down to 1/16"
date: 2026-10-25
description: "On a 413k-parameter GPT trained DiLoCo-style, top-k with error feedback matches uncompressed at keep 1/16 but costs 0.043 nats at 1/64 and 0.121 at 1/256."
tags: [lowcomm-training, research, distributed-training]
---

[lowcomm-training](../../research/lowcomm-training/) studies low-communication
training. The previous step found that top-k with error feedback, keeping 1/16
of each tensor's coordinates in the workers' updates, matched uncompressed
training (-0.005 nats against 1.5758, three seeds).

This step asked where that stops. Before running, I wrote down that 1/64 would
stay within 0.02 nats. It did not: over seeds 0 to 2, the excess loss is +0.043
at keep 1/64 (every seed between +0.037 and +0.051) and +0.121 at 1/256. The
free ride ends somewhere between 1/16 and 1/64, and only those two points sit
below it, so the exact knee is unmeasured. Even so, EF top-k at 1/64 is cheaper
than unbiased random sparsification at 1/16 (+0.083).

Limits: three seeds, one sync interval, one small model, and bytes are not
modelled, so "fewer coordinates" is not yet "fewer bytes". Log and code:
[`LOG.md`](../../research/lowcomm-training/LOG.md), milestone 4c.
