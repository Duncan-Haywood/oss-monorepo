---
title: "Tuning the inner learning rate erased our DiLoCo win"
date: 2026-10-25
description: "In the lowcomm-training programme, two earlier sweeps showed local-update training beating synchronous AdamW. With the inner learning rate tuned, it does not."
tags: [research, distributed-training, diloco, negative-result]
---

Two earlier sweeps in `research/lowcomm-training` said that DiLoCo-style
training (four workers, sync every H steps) beat synchronous AdamW on a 14k
parameter character model: H=16 by 0.1 nats, and H=1 with a large outer step by
0.2. Both used an inner learning rate of 3e-3 that nobody had tuned, on a
model still under-trained after 640 steps.

Milestone 2e tunes the inner lr per H (and for synchronous AdamW) from four
values, with the outer step set to plain averaging. Held-out loss, five seeds:
synchronous 2.159, H=1 2.149, H=4 2.167, H=16 2.183, H=64 2.210, H=160 2.218.
The inner lr alone moved every loss by about 0.2 nats, more than any effect of
H. The earlier "wins" were under-training, and the U-shape went with them: loss
rises gently with H, and H of 16 or less sits within two standard deviations of
synchronous (H=16 only just).

Limits: the best lr for H of 16 or less is the top of the grid, so those picks
are probably under-tuned; the model is far below the scale the programme
targets; outer momentum is off. The log and results file are in the
programme directory.
