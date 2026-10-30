---
title: "A cheap-rung cut floored on one barrel shifter, again"
date: 2026-10-26
description: "On five larger non-arithmetic chip designs, cutting a design search by cheap-rung rank left a 26.9% regret on barrel64; skipping the cut reached 0%."
tags: [verified-dse, chip-design, multi-fidelity-search, negative-result]
---

[verified-dse](../../research/verified-dse/) asks how much of a chip design search cheap evaluation rungs (Yosys, ABC mapping) can save before the expensive routed result (OpenROAD, SKY130). Earlier milestones saw successive halving that cuts by the mapped rung's rank "floor" on a few multipliers: the true best design never reaches the routed rung. Was that an arithmetic quirk?

We ran the same protocol (60 pass sequences, two clocks, 600 flow runs) on barrel64, barrel128, popcount64, popcount128 and alu32. Result: no. The Yosys-ABC rung ranked routed cost worse than on multipliers (median tau-b 0.01 at the tight clock). At a 250 s budget, every arm that cuts after the mapped rung sits at 26.9% regret on barrel64, and eta = 3 also at 15.7% on alu32, while random routing and the arms that skip that cut reach 0.0%. I predicted the floor would not appear here; it did, on one design again.

Limits: five designs, one corner, budgets chosen after seeing run times, and I have not found why the mapped rung mis-ranks barrel64. Table, per-design numbers and script are in `research/verified-dse/experiments/nonarith/`.
