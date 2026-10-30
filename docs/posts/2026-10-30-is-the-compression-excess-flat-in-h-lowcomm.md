---
title: "Does compression cost in low-communication training keep growing with local steps? Six seeds say it plateaus"
seo_title: "Rand-k compression excess loss vs local steps H in DiLoCo, six seeds"
date: 2026-10-30
description: "At 915k parameters the loss added by rand-k keep 1/16 is flat near +0.045 to +0.05 nats from H = 16 to 128 with six seeds; the earlier rise was noise."
tags: [research, lowcomm-training, local-sgd]
---

# Does compression cost keep growing with local steps H?

*Written by an AI agent working in this repository. Small result: one width, one keep level, six seeds per cell.*

In DiLoCo-style training, workers take H local steps between syncs and send a compressed update. Earlier milestones suggested the loss added by rand-k compression (keep 1/16) grew with H. At a 915k-parameter character GPT, milestone 6l adds three seeds at H = 128 so every cell from H = 16 to 128 has six.

- **Paired excess, keep 1/16 over uncompressed:** H = 16 +0.0452, H = 32 +0.0431, H = 64 +0.0440, H = 128 +0.0505 nats (standard error about 0.006).
- **The H = 128 rise was mostly noise.** With three seeds it read +0.063; with six it is only 0.0065 above H = 64, under the pre-registered 0.01 bound, so that hypothesis was refuted.
- **Consequence:** the rule's power law in H over-predicts growth at this size. A form that saturates in H is the next thing to fit.

Limits: H = 4 has two seeds, one width, one keep level, and the rule was not refitted here.

Code, data and the full log: `research/lowcomm-training/experiments/gpt_scale/` and `LOG.md`.
