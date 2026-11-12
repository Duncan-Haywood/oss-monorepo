---
title: "We re-tested our own lucky finding on new battery designs. It held."
date: 2026-11-12
tags: [cell-fidelity, batteries, simulation, multi-fidelity, pybamm, replication]
seo_title: "A 10-cycle SPMe screen beats GP-EI on fresh electrode designs"
description: Two battery design-search tricks were found after the fact. Re-run on 128 new designs, the short SPMe screen held; the co-kriging one only for big pools.
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search should split its compute between cheap battery models and the full DFN model. Its last two steps each ended on a winner nobody had planned for:

- **A short SPMe screen.** Run every candidate through 10 cycles of SPMe, the reduced model with an electrolyte correction. Then run the full 100-cycle DFN model in that order.
- **A cheap start for multi-fidelity Bayesian optimisation.** Begin with ten 2-cycle DFN runs, not five random full runs.

Both were picked after seeing the 128 designs they were scored on. A result chosen that way can be luck. So this step wrote four tests down first, then simulated 128 designs nobody had looked at: 384 PyBaMM runs, same parameter set, new random seed. All 15 search methods were replayed on them without changes.

**The short SPMe screen held.** On candidate pools of 64 designs, it reached a design within 1% of the DFN best in a median 123 s of charged compute. GP-EI on the full model took 220 s, and a plain SPM screen 205 s (both p < 0.001). The odd fact behind it also held. SPMe's ranking after 10 cycles tracks the full model's 100-cycle ranking better than SPMe's own 100-cycle ranking does (Spearman 0.67 against 0.58). On the new designs, SPMe ranks the true best design 2nd after 10 cycles and 48th after 100.

**The method ranking transferred.** The 15 methods' median times correlate at 0.92 between the old and new designs. So the earlier replays were not a quirk of one sample.

**The cheap-start search held only in part.** It beat GP-EI at every pool size, from 16 to 96 designs. But we had also required it to stay within 1.2x of the best screen at every size. It missed that on small pools: 1.4x on pools of 16 and 1.7x on pools of 32. On pools of 96 it was the fastest method of all (141 s). That test is refuted as registered.

**What a practitioner can take from it.** No method was fastest at every pool size, on either set of designs. The safest choice was a 2- or 10-cycle SPMe screen, never more than 1.4x slower than the best method at any size. GP-EI was up to 3.7x slower, and a full 100-cycle SPMe screen up to 8.7x. We found that comparison after the verdicts, so it describes the data rather than testing a claim.

The limit is the same as before, now sharper: this tests fresh designs, not fresh physics. It uses one parameter set (`OKane2022`), one cycling protocol and one machine's run times. Whether the short SPMe run wins because of SPMe or because of this cell's degradation model is the next step, on three other published parameter sets. One practical note from the run: two full DFN simulations ran out of memory at four parallel workers, so the bench now refuses to record a killed process as a model failure. Code, numbers and the registered plan: [`research/cell-fidelity`](https://marisstella.app/research/cell-fidelity/).
