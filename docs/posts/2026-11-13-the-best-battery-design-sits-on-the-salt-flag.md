---
title: "The best battery design sits on the salt flag, so don't throw flagged designs away"
date: 2026-11-13
tags: [cell-fidelity, batteries, simulation, pybamm, design-search, pre-registration]
seo_title: "Should a battery design search skip SPMe on salt-starved designs?"
description: A closed-form salt flag saves no time in an SPMe/DFN battery design search, but the best design sat on it in 8 of 21 conditions.
---

The `cell-fidelity` programme asks when a lithium-ion electrode design search can trust PyBaMM's SPMe, a cheap reduced battery model, instead of the full DFN model. Its trust test is the electrolyte's salt: where SPMe's own minimum salt concentration falls below 10% of the starting value, SPMe's score is not to be trusted and the design goes to DFN. The last step turned that test into a formula, r_kt. It needs only the parameter set and the design, and it costs 0.05 s per design instead of a simulation.

**The obvious next move.** If the formula already says a design will starve its electrolyte, its SPMe run is wasted: the search will verify it with DFN anyway. So skip SPMe on those designs and send them straight to DFN. We wrote down four predictions, then ran 256 new PyBaMM simulations on two fresh pools of 64 designs: `OKane2022` at 1.25 times the usual current and `Chen2020` at 1.5 times. We picked the two conditions by the formula alone, before any run.

**It saves nothing.** On the 19 conditions already run, the pre-screen took 0.91 to 1.08 times the wall time of the current procedure (median 1.01). On the fresh pools it took 1.12 and 0.90 times. SPMe is the cheap part of the bill: a run takes 3 s against DFN's 6 to 23 s on this machine. The flagged designs were going to DFN anyway, and the pre-screen sends all of them, where the old rule could stop partway through.

**But it found the best design where the old procedure did not.** On `Chen2020` at 1.5x, the procedure from the last two milestones returned a design 4.5% short of the pool's best (121.8 against 127.6 Wh/kg). It is the first miss in 21 conditions. The cause:

- The rule verifies designs with DFN from the most salt-depleted up. It stops after three in a row that SPMe scored within 25% of DFN.
- Here that run of three ended at a salt ratio of 0.071, inside the flagged block. The next design in the queue, at 0.078, was the best one.
- SPMe had scored that design 19% low. That is under the 25% mis-scoring label, so the rule had no reason to keep going.
- The answer step corrects for SPMe's bias using verified designs above the flag. None had been verified, so it had nothing to correct with.

The pre-screen sends every flagged design to DFN, so it reached that design. On this pool it was also cheaper than the old procedure (0.90 times) and than running DFN on everything (0.93).

**Why the best design keeps landing on the flag.** On all 21 conditions the best design's r_kt lay between -0.06 and +0.58, while the pools spread from -3.98 to +0.92. On 8 of them it sat below the 0.10 flag. That fits the physics: thicker, denser electrodes store more energy per kilogram until the electrolyte can no longer feed them. So the energy optimum sits at the edge of salt depletion. Throwing flagged designs away, the natural use of a starvation flag, would have missed the best by 1.9% and 6.5% on the fresh pools, and by up to 17% on the committed ones.

**A bound that did not help.** We also tried skipping flagged designs whose thermodynamic energy (PyBaMM's open-circuit energy from full to empty, over the stack mass) is below the best verified score. The bound held on all 1,395 designs, but at 1.06 to 14 times the 100-cycle DFN score it was far too loose: it would have pruned none of 429 flagged designs, even with the best score known in advance.

**What changes.** The salt flag is not a reason to discard a design, or to stop verifying. It marks where DFN runs are worth spending. The procedure for the paper becomes one with nothing to tune: DFN on every flagged design, and the trust rule above the flag. The caveats: two fresh conditions on graphite cells seen before at other currents, one miss, and timings from one 4-core machine.

Code, data and the pre-registered plan: [`research/cell-fidelity`](../../research/cell-fidelity/README.md) (milestone 5j in `LOG.md`).
