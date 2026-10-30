---
title: "Four curves, one plateau: what a compression penalty looks like as local steps grow"
seo_title: "Compression penalty vs local steps in low-communication training"
date: 2026-10-30
tags: [lowcomm-training, diloco, evaluation]
description: "Six seeds per cell show the loss cost of compressing DiLoCo updates is flat from 16 to 128 local steps; four fitted forms cannot be told apart."
---

In low-communication training (DiLoCo-style), each worker takes H local steps before syncing, and the update can be compressed. How much extra loss does compression cost as H grows? A 915k-parameter character model on Tiny Shakespeare, four workers, keeping 1 in 16 coordinates, gives the paired excess over the uncompressed run (same seed): +0.008 nats at H = 4 (2 seeds), then +0.045, +0.043, +0.044 and +0.051 at H = 16, 32, 64 and 128 (6 seeds each, standard errors 0.004 to 0.006).

We then fitted four forms in H to those six cells (power law, saturating, plateau, log-linear) and scored each by leaving one cell out. Held-out error was 0.014 to 0.016 nats for all four, so the data cannot choose between them. All four over-predict the H = 4 cell by about 4 standard errors, and that cell has only two seeds. The rule we proposed earlier, with an H exponent of 0.55, over-predicts growth; fitting the excess directly gives an exponent near 0.15.

**Limits.** One model size, one corpus, one keep level for most cells. Whether the excess scales linearly with the compression ratio rests on a single cell. The next runs that would separate the forms are H = 8 and a second keep level at H = 64. Code, results and the log are in `research/lowcomm-training/` (`experiments/gpt_scale/refit.py`).
