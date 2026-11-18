---
title: "Reading lithium plating at the particle surface cuts an LG M50 fade forecast's error by a third"
seo_title: "Lithium plating at the particle surface: LG M50 fade forecast"
date: 2026-11-16
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
description: "A ten-cycle forecast of 100-cycle lithium loss in PyBaMM LG M50 models drops from 35% to 21-23% error when plating is read at the particle surface."
---

The `cell-fidelity` programme forecasts how much lithium a battery electrode design will lose over 100 cycles from its first ten. The forecast has no fitted constant. It uses PyBaMM's own plating law: plating slows as exp(−αFΔU/RT) when lost lithium raises the graphite's potential at the top of charge. On the `NCA_Kim2011` cell the forecast lands within 2 to 4%. On the two LG M50 parameter sets, `Chen2020` and `OKane2022`, it over-predicts by about 35%. The [last step](2026-11-16-why-lithium-plating-slows-in-lg-m50-battery-models.md) found why. The rise that slows the plating happens at the loaded particle surface next to the separator (+38 mV by cycle 99), not in the open-circuit window the forecast reads (0.5 to 9 mV).

**What we changed.** One thing. From the design's first ten cycles we took how far the separator-side surface stoichiometry sits from the open-circuit one at the end of each charge. We then read the graphite's potential curve at that shifted point. The rest of the forecast is unchanged. Before any new run we wrote down four predictions in the [log](../../research/cell-fidelity/LOG.md). On 39 old designs this had cut the error to 13%, and it had made the two control cells worse.

**What happened.** We ran 128 fresh designs to 100 cycles in the full DFN model, 32 on each of four cell sets. That took about 25 minutes on four cores.

| Cell set | Open-circuit reading | Surface reading |
|---|---|---|
| `Chen2020` (LG M50) | 0.351 | **0.231** |
| `OKane2022` (LG M50) | 0.358 | **0.209** |
| `NCA_Kim2011` (control) | **0.030** | 0.065 |
| `Ai2020` (control) | **0.085** | 0.220 |

The figures are the median |ln(predicted / DFN)| of the cycle-99 lithium loss, so 0.2 is about a 20% miss. On LG M50 the surface reading wins on 20 and 23 of 32 designs and keeps the ranking (Spearman 0.96). It does not reach the 15% bar we set, and the fresh pools came out worse than the old ones. On the controls it hurts, as we predicted it would.

**The interesting part came after the verdicts.** We compared the potential rise each reading predicts with the rise DFN actually records at the separator. On `Ai2020` the surface reading predicts 89.2 mV and DFN shows 88.7 mV. The physics is right, and the forecast still gets worse (8.5% to 22%). The open-circuit reading predicts only 39 mV there yet forecasts better. So the earlier forecast was not reading the physics correctly on `Ai2020`. It pairs a feedback that is too weak with a ten-cycle power law that already bends too much, and the two errors cancel. Give it the correct feedback and the bend gets counted twice. On LG M50 the surface reading still under-reads the rise (19 against 26 mV), which is why it still over-predicts the loss.

**A loose end tied off.** Last step's log said that on `Ai2020` only 3% of the lithium PyBaMM reports as lost is booked to plating or SEI. That was not new physics. PyBaMM 26.10.1.1 adds up plating and SEI lithium over one electrode pair, but totals the cell's lithium over all of them, and `Ai2020` has 34 electrodes in parallel. Milestone 5p had already measured this and drafted an [upstream report](../../research/cell-fidelity/experiments/attribution/UPSTREAM.md), which is not filed yet. With the count applied, all 128 runs balance to five decimals and plating is 99.6% of the `Ai2020` loss. We missed it in the last step because we did not re-read our own earlier finding.

**What's next.** The forecast's shape should come from the plating kinetics, not from a power law fitted through ten cycles. Take a feedback-free rate from the first cycle or two, let the surface feedback carry all the slowdown, and test that on all four cell sets at once.

Everything here is modelled fade in one PyBaMM version with one set of plating parameters, not measured cells. Code, data and the pre-registration: [`research/cell-fidelity`](../../research/cell-fidelity/README.md).
