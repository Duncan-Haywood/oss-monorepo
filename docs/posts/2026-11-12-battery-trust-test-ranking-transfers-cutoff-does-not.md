---
title: "A battery-model trust test moved to two new cells: the ranking holds, the cut-off does not"
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, transfer]
description: SPMe's own salt depletion still finds the designs it mis-scores on two new PyBaMM cells (AUC 0.995), but the cut-off tuned on the first cell misclassifies 20% on the second.
---

Until today the `cell-fidelity` programme had one cell. Every result came from PyBaMM's `OKane2022` parameter set: the trust flag (SPMe's own minimum salt ratio marks the electrode designs it mis-scores), the cut-off of 0.07, and the finding that 10 cycles of SPMe rank designs better than 100. The proposal's H2 asked whether the cut-off comes from the physics, which would make it carry over to other cells unchanged, or from this one cell.

Today's step tested that. We logged four hypotheses first, then ran 384 new simulations: 64 electrode designs on two more cells, `Ecker2015` (a Kokam pouch) and `Ai2020` (an Enertech LCO/graphite pouch). Each ran SPM, SPMe and DFN for 100 cycles at the same areal current density as before.

- **The ranking transfers.** On Ai2020, SPMe scores 57 of the 64 designs more than 25% below DFN. Its minimum salt ratio still sorts mis-scored from sound designs at ROC AUC 0.995. Ecker2015 barely depletes its salt at this current, and SPMe mis-scores only one design there. r_min ranks that one first.
- **The cut-off does not.** The cut-off r <= 0.07 chosen on `OKane2022` misclassifies 1.6% of Ecker2015's designs but 20.3% of Ai2020's, just over the 20% bar we set, so H2 is refuted. Ai2020's own best cut-off is 0.33. SPMe goes badly wrong on that cell well before its salt runs out.
- **"Short beats long" was a property of one cell.** On `OKane2022` a 10-cycle SPMe run ranked designs against 100-cycle DFN better than a 100-cycle SPMe run did (0.67 against 0.58). On Ecker2015 the two are level (0.969 against 0.982), and on Ai2020 the long run is better (0.80 against 0.69). The reason lies in `OKane2022`'s cell, not in SPMe.
- **The cheap-first search order holds up.** On pools of 32 designs, screening every candidate with a 2-cycle SPMe or DFN run and then verifying with the full model beats Bayesian optimisation (GP-EI) on DFN on all three cells. Across the three cells it is never more than 1.3x slower than the fastest of nine methods; GP-EI is up to 3.7x slower. The plain SPM screen, fine on the other two cells, is slower than GP-EI on Ai2020, where its ranking correlates with DFN at only 0.32.

For an engineer running a reduced-model screen, the practical rule is to use SPMe's salt depletion as a ranking, not a fixed cut-off. Verify DFN from the most-depleted designs up, or calibrate the cut-off with a few full runs on the cell you actually have. If you need one screen that works on every cell, use a 2-cycle run.

The caveats are real. The two new cells are design-space variants of the published ones: the same 5% binder rule, the first cell's current density, and plating or SEI parameters borrowed where a set lacks them. They are not the cells Ecker and Ai measured. There are 64 designs per cell, the pools overlap, and every result is modelled. Code, numbers and the pre-registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
