---
title: "More seeds did not rescue the low-communication training rule"
date: 2026-10-30
tags: [lowcomm-training, research, negative-result]
description: "We blamed seed noise for a scaling rule missing at a wider model. Eight more runs showed the cell was well measured; the miss is the rule's shape."
---

The [lowcomm-training](https://duncan-haywood.github.io/oss-monorepo/research/lowcomm-training/) programme asks which of sync interval H and gradient compression set the final loss of DiLoCo-style local training. Its three-constant rule fitted a 413k-parameter character GPT to under 1% held-out error. At a 915k-parameter model it missed by 2.54%, almost all of it on one cell (H = 64, keep 1/16) that was held out by 0.174 nats. The log blamed seed noise: that cell had two seeds, 0.027 nats apart.

So we predicted that four more seeds would cut the error, and ran eight more training runs (the two H = 64 cells, seeds 2 to 5, about 17 minutes each). The prediction failed. The cell mean moved by 0.0001 nats (1.6456, standard error 0.004), leave-one-cell-out error stayed at 2.43%, and the held-out miss is still 0.163 nats, about 40 times the cell's standard error.

What the data say instead: the compression excess at size 2 is +0.054 at H = 16 and +0.044 at H = 64. It does not grow with H, where a power law with the fitted exponent says it should (it was still rising at the smaller model: +0.083 to +0.099). The rule's form in H, not its constants, looks like the weak part at the wider size. The next step is two more H values (32 and 128) to see whether the excess saturates. Two seeds on five of the seven cells, one corpus and one extra size are the limits.

Log: `research/lowcomm-training/LOG.md`, milestone 6i.
