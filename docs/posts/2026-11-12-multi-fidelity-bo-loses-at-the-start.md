---
title: "Multi-fidelity Bayesian optimisation for battery design loses its race at the start line"
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, bayesian-optimisation]
seo_title: "Multi-fidelity BO for battery design loses at the start"
description: Co-kriging BO over a cheap and a full battery model lost to GP-EI because of its random start. Started from cheap runs, it kept pace with the best screen.
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search should split its compute between a cheap battery model and the full DFN model. Yesterday's replay found something awkward for the textbook answer. On pools of 16 to 64 candidate designs, the fastest way to find a design within 1% of the best 100-cycle DFN score was crude: run every candidate through a cheap model (the plain SPM, or DFN stopped after 2 cycles), then run the full model in that order. Bayesian optimisation (GP-EI) on the full model only caught up at 96 candidates.

The obvious objection is that we never ran the method the multi-fidelity literature recommends, a Gaussian process that models both fidelities at once and picks the design *and* the model for each run. Today we did, on the same cached benchmark (128 designs, measured run times, 30 paired seeds per pool size, no new simulations). We used autoregressive co-kriging (Kennedy and O'Hagan, 2000) with two published rules for choosing the fidelity: augmented expected improvement (Huang and co-authors, 2006) and an upper-confidence rule after Kandasamy and co-authors (2016). We wrote three hypotheses down before running anything.

- **As planned, it lost.** Every co-kriging variant was slower than plain GP-EI or no faster: the best took 205 s against GP-EI's 220 s on pools of 64 (not significant) and 267 s against 220 s on pools of 96. On small pools it was three times slower than a cheap screen (157 s against 46 s at 16 designs). Two of the three hypotheses were refuted.
- **The third held.** Charging each design its own measured run time (19 to 67 s for one full DFN run, depending on electrode thickness) rather than a typical one left the ranking of the eight methods almost unchanged (Spearman 0.90).
- **The loss happens at the start.** The standard start puts five random designs through the full model before the cheap model has any say. That costs 122 s, more than half of what the best screen needs in total. After that, the cheap-model runs are almost free (under 25 s per search). The real cost is full-model runs: 7 to 11 for co-kriging against 3 to 6 for a screen.

So we tried one thing we had not planned: start the same search from ten 2-cycle DFN runs, then run the full model on the best two of them. It **kept pace with the best screen at every pool size**: 38, 90, 144 and 174 s at 16, 32, 64 and 96 designs, against 46, 68, 153 and 199 s for whichever screen was best at that size. It beat GP-EI everywhere. No single screen is best at every size; this search stays within 1.4 times the best at all four. But we picked the start after seeing the planned result, and its two settings were never varied. Until a pre-registered test on fresh designs confirms it, it is a lead, not a finding.

The practical reading for anyone running PyBaMM or a commercial P2D tool in a design loop: whatever multi-fidelity method you use, let the cheap model choose your first expensive runs. Spending the first full-model budget at random throws away the thing that made cheap screening win. All of this is modelled (PyBaMM, `OKane2022`, one protocol) and replayed over pools drawn from one set of 128 designs. Code, numbers and the pre-registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
