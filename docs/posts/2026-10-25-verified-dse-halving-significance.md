---
title: "Gentle-cut halving beats random search on most designs, and ten designs cannot prove it"
date: 2026-10-25
description: "verified-dse milestone 14: successive halving (eta 1.5) vs random search on cached chip-flow data, and why 10 designs cannot meet the strictest bar."
tags: [verified-dse, research, statistics, eda]
---

[verified-dse](../../research/verified-dse/) asks whether cheap early stages of a
chip-design flow can rank design points well enough to save routing time.
Milestone 13 found that a gentle successive-halving cut (keep 1/1.5 of the pool
per rung) removed the "bias floor" earlier cuts hit. Its win/loss counts were
descriptive, so milestone 14 tests them.

On the 10 small designs at the tight clock, eta = 1.5 beats random search at 20,
30 and 45 s with mean regret differences of about -0.5 points and the same sign
on 5, 7 and 7 designs (zero worse). Exact Wilcoxon p-values over designs are
0.012, 0.008 and 0.004. After Holm correction the best is 0.062: with 10 designs
the smallest possible two-sided p is 0.002, so one rejection among 16 cells is
nearly out of reach. With 5 larger designs the floor is 0.0625, so nothing there
can be called significant, whatever the effect.

A leave-one-family-out choice of eta (all mults together, all adders together)
still loses to fixed 1.5 on the larger designs at the relaxed clock: the held-out
mults get a harder cut. So the paper claim is "1.5 as a default, effect sizes and
signs reported", not "eta is learned" and not "significant".

Everything is in `research/verified-dse/experiments/signif/`; it runs in about
75 s from cached tables. More designs, not more seeds, is what would move this.
