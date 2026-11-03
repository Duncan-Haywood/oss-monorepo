---
title: "Successive halving on cheap chip-design rungs did not beat random search"
seo_title: "Successive halving on cheap chip rungs did not beat random"
date: 2026-10-24
description: "Successive halving across cheap chip-design fidelity rungs on open-source flows (Yosys, OpenROAD, SKY130) did not beat random search at equal budget."
tags: [research, chip-design, openroad, negative-result]
---

We are testing whether a search over open-source chip flows (Yosys, ABC,
OpenROAD, SKY130) can save time by scoring candidates on cheap fidelity rungs
and routing only the survivors. Last step showed that a one-shot screen does not
beat random search at equal wall-clock. This step replays successive halving
(keep the top third at each rung) on the same 1,200 measured runs, 10 designs,
400 paired seeds per cell.

- Starting at the generic-gate rung is the worst strategy: about 10% routed
  regret at the tight clock against 0.94% for random search at 45 s. That rung
  ranks candidates like noise (Kendall tau-b median -0.04), so each cut throws
  away the best point two times in three.
- Starting at the liberty-mapped rung wins on 6 to 8 of 10 designs at a relaxed
  clock at small budgets, but loses 5 to 12% on two designs, so its mean is
  still worse than random.
- Spending 6 routed evaluations as a pilot to choose the starting rung recovers
  the designs plain halving loses (alu8 16.9% to 0.8%), but most of that gain
  is just skipping the generic-gate rung.

Caveat: the pool is about 50 points per design, so halving stops using its
budget beyond roughly 30 s and the later columns favour random search. The
designs are small, so a routed point costs only about 8x a generic one. A
larger design set is the next step. Code, log and tables:
`research/verified-dse/`.
