---
title: "Two cheap cycles can't see the plating fade"
date: 2026-11-14
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, degradation, pre-registration, negative-result]
seo_title: "Can two SPMe cycles predict lithium plating fade in PyBaMM?"
description: "A two-cycle SPMe plating predictor on 2,324 Li-ion designs: the plating rate doesn't rank 100-cycle fade, and SPMe fails on 20% of the designs."
---

The last post in this series found that the capacity fade in the `cell-fidelity` programme comes from lithium plating, not SEI growth. That suggested a shortcut. A design search spends most of its compute running PyBaMM's full DFN model for 100 cycles to see which designs keep their energy. If plating is the whole story, a cheap model that includes plating should be able to flag the designs that will fade, after a cycle or two and before any DFN run.

**What we tried.** We ran SPMe, PyBaMM's reduced model, for two cycles with the same SEI and plating options on every design already simulated to 100 DFN cycles. That came to 2,324 designs across 36 cell-and-current conditions and about 35 minutes on four cores. From each run we took the energy in cycle 2 and the lithium lost in cycle 2. Then we built three predictions of the cycle-100 energy, none with a fitted constant:

- the cycle-2 energy alone;
- that energy minus the cycle-2 lithium loss carried on for 98 more cycles;
- the same, but with the loss slowing down as the cell gives up lithium. As lithium is lost, the negative electrode ends each charge a little emptier, its potential rises, and PyBaMM's plating law slows down exponentially.

We had already looked at results on 12 of the conditions. Before reading the other 24, we wrote four predictions into the [log](../../research/cell-fidelity/LOG.md).

**All four were refuted.**

- **The plating rate doesn't rank the fade.** We expected a Spearman correlation of at least 0.5 between the cycle-2 loss and the actual 100-cycle fade. The median was 0.03, and 19 of 24 conditions were below 0.3.
- **Adding plating makes the ranking worse.** On 20 of 24 conditions, the plating-corrected prediction ranked designs worse than SPMe's plain cycle-2 energy (median Spearman 0.58 against 0.82).
- **As a pool cut it misses and doesn't pay.** We kept the top half of designs by the corrected prediction and then ran the programme's current 10-cycle screen on them. That missed the best design by more than 3% on two conditions (6.1% at worst). It also cost 0.92 to 1.45 times as much as the screen alone, because the predictor costs more than the DFN cycles it saves.
- **SPMe can't run a fifth of the designs.** On high-current pools its salt concentration goes negative and the run fails. That happened on 456 of the 2,324 designs, and on 7 of the 36 pools the failed designs included the best one.

**Why.** The answer was already in the last milestone's runs. Over 20 cycles, the energy a design lost per unit of lithium lost ranged from about 0.9 to 2.1 within a single pool. Some designs lose a lot of lithium and little energy, and others the reverse. What decides it is electrode balance: which electrode limits the capacity, and how much spare lithium the negative electrode holds. A plating rate tells you how fast lithium goes. It doesn't tell you how much of that lithium was capacity. A cheap fade predictor needs that second map. PyBaMM's electrode state-of-health solver is the obvious tool, though a quick scratch try returned capacities that went the wrong way and will need care.

**What changes.** Nothing in the recommended procedure. Dropping designs below a closed-form salt threshold, then running ten DFN cycles with a √cycle fade fit, is still exact or within 0.32% on all 36 conditions, and nothing here was cheaper. We also caught one mistake of our own before publishing. The first report measured the cut's misses against the best design SPMe could run rather than the best in the pool, which hid the seven pools where SPMe fails on the winner. Fixing it changed no verdict and made the misses larger.

**Limits.** These are committed design pools, not fresh ones, and most of the 24 test conditions are ones where energy rather than fade picks the winner. The model is PyBaMM 26.10.1.1's SPMe plating, not a measured cell.

The code, the 2,324 predictor runs and every number are in the [project folder](../../research/cell-fidelity/experiments/plating/) and the programme's [README](../../research/cell-fidelity/README.md).
