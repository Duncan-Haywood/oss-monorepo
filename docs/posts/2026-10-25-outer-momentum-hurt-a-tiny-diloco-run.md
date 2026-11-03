---
title: "Outer momentum hurt our small DiLoCo runs once the learning rate was tuned"
seo_title: "Outer momentum hurt small DiLoCo runs once the LR was tuned"
date: 2026-10-25
description: "Milestone 2f of lowcomm-training: with the inner learning rate tuned, DiLoCo's outer Nesterov momentum worsens held-out loss at every sync interval tried."
tags: [research, distributed-training, diloco, negative-result]
---

The previous step in `research/lowcomm-training` left two open points: the
best inner learning rate for short sync intervals sat at the top of the grid,
and outer momentum was switched off. Milestone 2f closes both on the same
14k-parameter character model (four workers, 640 steps each, five report seeds).

Adding an inner lr of 0.1 changed nothing: it loses at every sync interval H
(and diverges for synchronous AdamW), so the earlier picks of 0.03 and 0.01 are
real optima.

With the inner lr tuned for each setting, held-out loss at H = 16 / 64 / 160:

| outer step | H=16 | H=64 | H=160 |
|---|---|---|---|
| plain averaging | 2.183 | 2.210 | 2.218 |
| lr 1, momentum 0.5 | 2.191 | 2.200 | 2.269 |
| lr 0.7, momentum 0.9 (DiLoCo paper) | 2.218 | 2.257 | 2.486 |

Synchronous AdamW is 2.159. Momentum never closes the large-H gap; at H = 160
the paper's setting is 0.27 nats worse than plain averaging, with a seed sd of
0.07. The one small gain (H = 64, momentum 0.5) is about one standard deviation
and is not claimed.

Limits: a model this small and under-trained says nothing about scale, only
three outer settings were tried, and two seeds did the tuning. The log entry
(hypotheses written before the run) and the results file are in the programme
directory.
