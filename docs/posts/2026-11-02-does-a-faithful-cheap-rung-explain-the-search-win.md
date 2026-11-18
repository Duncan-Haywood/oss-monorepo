---
title: "Does a faithful cheap rung explain the search win?"
date: 2026-11-02
tags: [research, chip-design, multi-fidelity, negative-result]
description: In a chip-flow search study, BOHB's low-budget win correlates only weakly with how faithful the cheap synthesis rung is (rho +0.19, interval includes 0).
---

Earlier runs of the `verified-dse` programme found that a Hyperband-style search with a density model beats random routing at low budget, and that the win was larger on five held-out designs. The explanation offered, with no test behind it, was that the cheap synthesis rung (R2) ranks designs more faithfully on those designs.

This run tested it on the 50 cached design and clock cells, with the prediction written first. For each cell it took the Kendall tau of R2 against routed area-delay and correlated it with the search's gain over random routing. Spearman rho is +0.19 at 15 routed-run equivalents (95% interval -0.13 to +0.48), +0.14 at 25 and +0.08 at 40. Every interval includes zero. Splitting by clock did not change this. Two of my predictions were wrong: I expected the interval at 15 to exclude zero, and I expected the clock to drive the correlation.

So the "faithful rung" story stays a hypothesis. With 50 cells that repeat across clocks, a true correlation near 0.3 would not show up. The next step is a causal test: degrade R2 on purpose and replay the search. The code, per-cell data and log entry are in `research/verified-dse/` (milestone 61).
