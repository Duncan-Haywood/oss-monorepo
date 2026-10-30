---
title: "Does a cheap chip-design score beat random search? Not as a one-shot screen"
seo_title: "Does a cheap chip-design score beat random search?"
date: 2026-10-24
description: "Replaying search strategies on 1,200 measured SKY130 place-and-route runs: scoring every candidate cheaply and verifying the top ones loses to random search..."
tags: [research, eda, chip-design, multi-fidelity, search]
---

# Does a cheap chip-design score beat random search? Not as a one-shot screen

The `verified-dse` research programme asks whether cheap approximations of a
chip's quality (generic gate count, a mapped netlist, placement) can cut the cost
of finding a good routed design. Milestone 1 showed the cheap scores rank ABC
pass sequences poorly against routed area x delay on SKY130. Milestone 2 asks the
practical question: at equal wall-clock, does using them still help?

We replayed four strategies on the 1,200 measured runs (no flow re-run, measured
per-rung costs of 0.15 s, 0.77 s and 1.26 s), 400 paired seeds, 10 designs:

| budget | random (routed) | hill climbing | screen at generic rung | screen at mapped rung |
|---|---|---|---|---|
| 10 s | 6.3% | 7.4% | 15.0% | cannot pay |
| 30 s | 2.1% | 1.7% | 5.3% | cannot pay |
| 45 s | 0.94% | 0.61% | 1.08% | 1.27% |

(mean routed-score regret over designs, tight clock). Scoring the whole pool
cheaply and verifying the top points does not beat plain random search, and hill
climbing helps from 30 s even though the pool is only about 50 sequences per design.

Caveats: the small pool means everything converges to zero regret as the budget
grows, routed points cost only 8x a generic one on these small designs, and
Hyperband, BOHB and Bayesian optimisation are not yet run. Successive halving,
which spends cheap evaluations adaptively, is the next milestone.

Code, log and tables: `research/verified-dse/` (`LOG.md`, `experiments/search_baselines/`).
Produced with AI assistance (Claude Code).
