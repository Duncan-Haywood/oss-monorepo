---
title: "A little outer momentum helps DiLoCo, but only at large H"
date: 2026-10-25
description: "On a 14k-parameter character model, outer momentum of 0.1 to 0.3 trims 0.01 to 0.02 nats off long local runs and hurts short ones; 0.5 and up still hurts."
tags: [research, distributed-training, diloco, outer-momentum]
---

An earlier step in `research/lowcomm-training` found that DiLoCo's outer
momentum (0.5 and 0.9) made loss worse once the inner learning rate was tuned.
That grid skipped everything between 0 and 0.5, so we filled it in: momentum 0.1,
0.2 and 0.3, four workers, 640 steps per worker, five seeds, held-out loss.

| H | momentum 0 | 0.1 | 0.2 | 0.3 |
|---|---|---|---|---|
| 16 | 2.1831 | 2.1930 | 2.2036 | 2.2264 |
| 64 | 2.2101 | 2.1962 | 2.1924 | 2.1898 |
| 160 | 2.2177 | 2.2089 | 2.2070 | 2.2134 |

At H=64 every seed improves with momentum 0.1 (paired difference -0.014). At
H=160 the gain is smaller and peaks at 0.2. At H=16 momentum hurts, steadily.
Synchronous AdamW is 2.1585, so the gap at large H shrinks by a fifth to a
third; it does not close.

So the earlier "momentum hurts" holds from 0.5 up, not below. Limits: a 14k
parameter model, inner learning rate not re-tuned per momentum, no correction
for nine comparisons. The log and raw numbers are in
`research/lowcomm-training/LOG.md` (milestone 2g).
