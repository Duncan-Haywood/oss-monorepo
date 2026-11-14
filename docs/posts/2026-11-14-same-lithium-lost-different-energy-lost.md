---
title: "Same lithium lost, different energy lost: electrode balance explains battery design fade"
date: 2026-11-14
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, electrode-balance, pre-registration]
seo_title: "Why do Li-ion designs fade differently for the same lithium loss?"
description: "A no-fit electrode-balance map turned PyBaMM DFN lost lithium into energy fade within 0.05 on 34 of 40 fresh designs, ranking Ai2020 fade at 0.95."
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search can spend less on PyBaMM's full DFN model without missing the best design. Two steps ago we found that almost all the capacity fade in these runs comes from lithium plating, not SEI growth. The last step tried to predict that fade cheaply from the plating rate, and failed. The rate didn't rank the fade at all. One reason stood out: two designs in the same pool could lose the same share of their lithium and lose very different amounts of energy, by a factor of about two.

**The idea.** Lost lithium doesn't turn into lost energy one for one. A cell charges until its voltage hits the upper cut-off and discharges until it hits the lower one. Between those limits sits a window on the two electrodes' open-circuit curves. When lithium is lost, that window moves. If the negative electrode has spare room, the window first slides along the curves and keeps most of its width. Once that room is gone, the window shrinks. How much room a design has depends on its electrode balance: the two electrodes' capacities, how much lithium the cell holds, and where the cut-offs fall on each curve.

That can be worked out from the parameter set and the design alone, with no simulation and no fitted constant. We wrote a small solver for it: find the window where the positive's voltage minus the negative's equals each cut-off, with the lithium shared between them, and integrate the voltage across it. It takes about 0.05 seconds per design.

**The test.** If the map is right, the fade problem splits in two. One part depends only on the design (the map). The other is how fast the design loses lithium, which still needs simulation. So we fed the map each DFN run's own lithium loss and asked whether it predicts the energy that run lost. We checked it first on the 31 designs from the plating study, then wrote down four predictions and ran 128 new DFN simulations: the same eight cell and current conditions, eight new designs each, 20 cycles with degradation and without, so protocol drift isn't counted as fade.

- **Accuracy (supported).** On 34 of the 40 new designs that lost more than 3% of their lithium, the map landed within 0.05 of DFN's fade. The bar was 75% of designs.
- **Better than a constant (supported).** Its mean error was 0.038. The best single "fade per unit of lithium" figure, fitted on the earlier designs, managed 0.053.
- **Ranking (supported).** Within each condition, the map ranked the designs by fade at least as well as the raw lithium loss on all five conditions that fade. On the `Ai2020` cell at low current it scored Spearman +0.95, against +0.48 for lithium loss alone. That's the cell where the earlier cheap screens failed, because fade decides which design wins there.
- **Where it fails (supported).** The errors cluster on designs that deliver only a small part of their open-circuit energy at this current (Spearman −0.73). On `NCA_Kim2011`, three designs delivered under a quarter of it and the map overshot their fade by up to 0.24. Those designs are limited by how fast lithium can move, not by how much there is, so lithium they lose comes out of capacity they weren't reaching anyway.

**What it means for a designer.** If you see two electrode designs losing lithium at the same rate but fading differently, look at the balance first. The spare capacity on the negative side and the cut-offs decide how much of that lost lithium shows up as lost energy. The calculation needs only the open-circuit curves your model already has. It isn't a fade predictor yet, because it still needs the lithium-loss rate. The next step is to get that rate from a short run, extrapolate it, and push it through the map.

**Limits.** 20 cycles, not 100. Five conditions with fading designs, eight designs each. The map is open-circuit only, with no rate term, and it under-predicts fade by about 0.03 on two graphite cells (`OKane2022`, `Chen2020`). The plating parameters are copied from `OKane2022` onto six of the seven cells. Everything is modelled in one PyBaMM version (26.10.1.1), not measured on real cells.

The plan, the outcome and the numbers are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
