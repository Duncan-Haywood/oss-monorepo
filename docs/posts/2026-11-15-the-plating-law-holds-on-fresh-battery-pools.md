---
title: "The plating law predicts battery fade on fresh pools, but a better forecast can rank designs worse"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Lithium plating fade forecast holds on fresh battery designs"
description: "With no fitted constant, PyBaMM's plating feedback predicts 100-cycle lithium loss within 2-10% on 192 fresh designs; a smaller error did not always rank better"
---

The `cell-fidelity` programme tries to forecast a lithium-ion electrode design's energy after 100 charge cycles from its first ten. In the [last step](2026-11-15-the-plating-exponential-explains-one-battery-not-three.md) we derived the forecast's correction from the plating law instead of fitting it. PyBaMM's plating rate falls as exp(−αFΔU/RT) when lost lithium raises the negative electrode's potential at the top of charge. That derivation fixed a 30% error on one cell (`NCA_Kim2011`), counted the effect twice on another (`Ai2020`), and was tested only on pools earlier steps had already read.

This step asked two things. Does it hold on designs nobody has looked at? And does the double count go away if one law is fitted to the loss with the feedback taken out?

**The test.** On the ten existing pools we tried three shapes for the feedback-free loss: linear, square root and power law. A power law, a·n^b, gave the smallest error on both cells, and with it no law has to be chosen per pool. We fixed that predictor and four pass/fail bars in the [log](../../research/cell-fidelity/LOG.md) before running anything new. Then we ran 192 fresh designs to cycle 100 in PyBaMM's DFN model with SEI growth and lithium plating, at currents no earlier step had run that far: `Ai2020` at 0.55× and `NCA_Kim2011` at 0.75× and 1×. That took about 55 minutes on four cores. No run failed.

**What came out.**

| Pool | Ten-cycle law, error at cycle 99 | Last step (5x) | Power law on the feedback-free loss |
|---|---|---|---|
| `Ai2020@0.55x` | 18% | 32% (too low) | 10.2% (too high) |
| `NCA_Kim2011@0.75x` | 30% | 3.8% | 3.8% |
| `NCA_Kim2011@1x` | 31% | 2.4% | 2.4% |

- **The physics carries to new designs.** On both fresh `NCA_Kim2011` pools nothing was fitted. α and T come from the parameter set. The lithium-loss error falls from about 30% to 2 to 4%, and the energy ranking (Spearman 0.82, 0.93) beats a map calibrated on 8 extra 100-cycle runs (0.62, 0.84).
- **One law fixes the double count.** On `Ai2020` the error falls from 32% to 10.2%, just above our 10% bar, so that hypothesis is scored mixed rather than supported.
- **A smaller error ranked worse.** On `Ai2020`, last step's forecast is 32% too low but about equally low for every design, and it ranks the 100-cycle energy at 0.974. The new one is 10% off, by different amounts for different designs, and ranks at 0.875. An earlier step found the energy map amplifies how the error varies between designs, and this is that effect again. Forecasting how much a design fades and picking which design fades least are different targets, and one error number does not score both.
- **The cycle-10 energy already orders these pools.** Raw cycle-10 energy ranks the 100-cycle energy at 0.93 to 0.96 on all three, at or above every fade-aware list. So these pools test the fade forecast, not a design screen.

**Limits.** These are two cell parameter sets, and the law shape was chosen on pools we had seen. The LG M50 sets were left out because their graphite sits on a voltage plateau and gives the feedback nothing to act on. Lost lithium includes SEI growth, which we treated as plating. Every set uses OKane2022's plating parameters. Everything here is PyBaMM 26.10.1.1 simulation, not measured cells.

Next: pools where fade reorders designs after cycle 10, with the size forecast and the ranking scored separately. Code, data and figure are in `research/cell-fidelity/experiments/rlaw/` and the programme's [README](../../research/cell-fidelity/README.md).
