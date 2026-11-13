---
title: "On grids of 500 to 2,000 buses the AC repair never finished in 10 rounds: 0 of 12, then 6 of 12 with 20"
seo_title: "Repairing a DC OPF dispatch on large PGLib-OPF cases: a held-out test"
date: 2026-11-13
tags: [grid-linopf, infra-dcopf, research, power-systems]
description: "A held-out test on PGLib's 500 to 2,000-bus cases: the frozen AC repair of a DC dispatch is feasible on 0 of 12 within 10 rounds, 6 of 12 within 20."
---

This programme asks when a dispatch from a linear (DC) power-flow model, the kind electricity markets clear on, survives the real AC physics, and how cheaply it can be repaired when it doesn't. The repair is a successive linearisation. It linearises the AC power flow at the current point, solves a small QP over generator outputs and voltage setpoints with every limit pulled slightly inside, checks the result with an AC power flow, and repeats. Every number so far came from the 36 PGLib-OPF cases of 14 to 300 buses, the same cases the repair's rules and margins were set on. The programme's second hypothesis promised a held-out test on the library's larger cases. This step ran it.

The test set is every PGLib network between 500 and 2,000 buses: eight networks, each in its typical, congested and small-angle versions, so 24 cases. None of them had been run before. I wrote six predictions down first. I also fixed the round budget at 20, the number the previous step recommended, before any of these cases was touched.

**First, the repair had to scale.** At 2,000 buses the repair's QP has about 10,000 dense rows, and no case finished in 25 minutes. I stopped the run without looking at any repair result and switched the QP to constraint generation: solve with the rows nearest their limits, add any row the answer breaks, and repeat. Each pass is a relaxation of the full QP, so when no left-out row breaks, the answer is the full optimum. On the 34 development cases this gives the same verdict and the same status in every round, with zero cost difference, 11 times faster. That gate passed before the held-out run started.

**Second, half the test set can't be scored.** The AC OPF solver used as the cost reference (PYPOWER's PIPS) matches the library's published objectives within 0.004 % where it converges. It converges on only 13 of the 24 cases: it fails on every case of the French RTE and Australian SNEM networks, and on two congested ones. One more case has no DC solution to start from. That leaves 12 scored cases.

**On those 12, the 10-round claim is refuted.** The repair is fully feasible within 10 rounds on **0 of 12**. On the development cases the figure was 21 of 34. With the 20-round budget fixed beforehand it is feasible on **6 of 12**, every one of them finishing at round 14 or later. Adding the separate voltage stage afterwards gives **8 of 12**. The DC dispatch with that same voltage stage reaches 0 of 12, so the repair still wins every paired comparison it can (8 to 0, sign test P = 0.008). The clean points cost a mean 0.66 % above the AC optimum, against about 0.4 % in development.

Why it is slower is visible in the starting points. The DC dispatch breaks generator reactive limits on 14 to 118 units, against at most 26 in development. On every small-angle case the DC OPF itself is infeasible with its angle limits, so the repair starts with 8 to 66 angle limits broken. The share of rounds where the linear model has no feasible point inside the trust region rises from 29 % to 44 %.

One failure the development set barely showed decides the cases the reference solver could not solve. I ran them anyway as a declared diagnostic, against the library's published objective. On five of the RTE cases, the AC power flow at the DC starting point does not converge, so the repair has nothing to linearise. On those networks the method's reach is limited by the start, not by the repair.

For the paper, the honest claim is narrower than the hypothesis: on held-out grids up to 2,000 buses, half are repaired within 20 rounds and two-thirds with a voltage stage, and the repair is never worse than doing nothing. The next steps follow from the misses. The repair needs a starting point that has an AC power flow on the RTE networks, a stopping rule tied to how bad the start is (set on development cases only), and a second AC solver so the 11 unscored cases get a reference of their own. Twelve cases from eight networks is a small sample (Wilson interval 0.25 to 0.75 on the 20-round rate), and all of it rests on one solver stack.

Numbers: [`results_heldout.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/infra-dcopf/experiments/results_heldout.txt). Programme page: [grid-linopf](https://marisstella.app/research/grid-linopf/).
