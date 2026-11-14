---
title: "When the best battery design starts in the middle of the pack"
date: 2026-11-14
tags: [cell-fidelity, batteries, simulation, pybamm, design-search, successive-halving, pre-registration]
seo_title: "Can you stop a DFN battery simulation early in a design search?"
description: "Successive halving over resumed PyBaMM DFN runs found the best Li-ion electrode design on 2 of 3 fresh pools; on the third, the winner was 28th at cycle 10."
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search can spend less on PyBaMM's full DFN model without losing the best design. The last step found a cheap answer for most cells: run DFN for 10 cycles on every design, then run the top 3 to cycle 100. That worked on fresh data. It also had one known failure. On the `Ai2020` cell at low current, it missed the best design by 6 to 7%. Those are the runs where capacity fade keeps reordering designs after cycle 10.

**The idea: don't cut once, cut in steps.** Successive halving is a standard trick from hyperparameter tuning. Run everything cheaply, keep the best fraction, give the survivors more budget, and repeat. Here the budget is cycles. Every design runs to cycle 10. The top 16 continue to 20, the top 8 to 50, and the top 3 to 100.

That only pays if a run can pick up where it stopped. PyBaMM can resume a simulation from a saved state. We checked that against uninterrupted runs on 23 designs. The per-cycle energies matched bit for bit. The resumed runs were also slightly faster, at 0.85 to 0.97 of the uninterrupted run's time.

**What we predicted, then ran.** We picked the ladder on the 27 conditions already simulated, where it was exact on 26. Then we wrote down five predictions and ran 216 new simulations on three conditions no earlier step had used: `Ai2020` at 0.3 and 0.4375 times the usual current, and `Ecker2015` at 0.75 times.

- **The answer (mixed).** The ladder found the best design on `Ai2020` at 0.4375× and on `Ecker2015`. On `Ai2020` at 0.3× it came 2.7% short. The 10-cycle screen missed the same pool by 8.8%.
- **The price (mixed).** It cost 0.24 to 0.29 of running DFN to cycle 100 on everything, against a bar of 0.25. The development replay had charged the first 10 cycles at a tenth of a run. They actually take 15 to 17%, because setting up the run and the first cycle are slow.
- **Against the 10-cycle screen (supported).** The ladder did as well or better on all three pools.
- **The hard regime is real (supported).** On the two fresh `Ai2020` pools, the cycle-10 energy ranked the cycle-100 energy at Spearman 0.24 and 0.76.
- **Resuming is exact (supported).**

**Why it still missed.** On `Ai2020` at 0.3×, the best design ranked 28th of 53 at cycle 10 and 23rd at cycle 20. It only reached first place at cycle 50. The designs that start strongest also fade fastest, and their curves cross the eventual winner's after cycle 20. Any ladder that cuts below about 28 designs at cycle 10 loses it. Keeping 32, then 16, then 4 gets within 0.9%, at 0.38 of the full cost. Running everything to cycle 50 is exact, but that costs 0.64.

**What it means for a designer.** On most cells, a short DFN run and a few long ones find the best design at about a quarter of the cost. Resuming runs, rather than restarting them, makes every extra rung cheap. Where early fade is a poor guide to late fade, as on `Ai2020` below about 0.4×, no ranking from the first 20 cycles is enough. That needs a predictor of late fade, perhaps from the fade rate or lost lithium early in the run. That is the next step.

**Limits.** Three conditions, 64 designs each (53 on `Ai2020` at 0.3×, where 11 failed in the first cycle). One PyBaMM version and one machine's timings. The fade comes from PyBaMM's degradation models, not measured cells.

The plan, the outcome and the numbers are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
