---
title: "Why lithium plating slows down in LG M50 battery models: look at the particle surface, not the rest voltage"
date: 2026-11-16
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Why lithium plating slows over 100 cycles in LG M50 models"
description: "In PyBaMM's DFN model the LG M50 cells' plating slows 3.3x over 100 cycles because the surface OCP by the separator rises 38 mV, not the 0.5 mV seen at rest"
---

The `cell-fidelity` programme tries to forecast how much energy a lithium-ion electrode design will have after 100 cycles from its first ten. Two steps ago we derived the forecast's correction from the plating law itself. PyBaMM's irreversible plating rate falls as exp(−αFΔU/RT) when lost lithium raises the negative electrode's potential at the top of charge. That fixed a 30% error on the `NCA_Kim2011` cell. It predicted no correction at all for the two LG M50 parameter sets, `Chen2020` and `OKane2022`: their graphite sits on a flat plateau at the end of charge, so we computed a potential rise of only 0.5 to 9 mV. The [last step](2026-11-15-the-plating-law-holds-on-fresh-battery-pools.md) left those sets unexplained. Their per-cycle loss still falls about threefold over 100 cycles, and no ten-cycle law gets the shape (errors of −33% and +44%).

**What we did.** First we tried another explanation on the stored runs: the plating slows because each charge gets shorter as capacity fades. It made the forecast far worse, about 75% too low. Then we wrote the next test down in the [log](../../research/cell-fidelity/LOG.md) before running it. We re-ran 40 stored designs to cycle 100, 12 from each LG M50 pool plus controls on `NCA_Kim2011` and `Ai2020`. At the end of every charge we recorded each term of PyBaMM's plating exponent at the point where plating is fastest, the negative electrode next to the separator. The terms are the surface open-circuit potential, the intercalation overpotential, the SEI film overpotential and the salt concentration. The bench took four minutes.

**What came out.**

| Pool | Plating share of lost lithium | Per-cycle plating, cycle 2 → 99 (log) | Surface OCP rise at the separator | Same rise at rest (5x) |
|---|---|---|---|---|
| `Chen2020@1.5x` | 99.8% | −1.23 | +37.5 mV | 0.5 mV |
| `OKane2022@1.5x` | 99.8% | −1.18 | +38.4 mV | 8.9 mV |
| `NCA_Kim2011@0.875x` | 98.7% | −4.42 | +107 mV | 132–161 mV |

On the LG M50 sets the surface OCP term alone, −κΔU with κ = 25.3 per volt, accounts for 1.16 to 1.20 times the change in the end-of-charge exponent. A growing intercalation overpotential cancels part of it, and the film and salt terms are small. It is the same mechanism as on `NCA_Kim2011`. Under charge, the particle surface by the separator runs ahead of the bulk and off the plateau. There, lost lithium moves it back down a steep part of the curve. At rest the electrode shows almost nothing. A rate index built from that one node tracks the per-cycle plating change to within 1.5%. Re-runs matched the stored ones to better than 0.01%.

So our hypothesis that LG M50 needed a different mechanism (H141) is refuted. That is the useful outcome: one law can cover all three plating-dominated sets, provided the feedback is read at the loaded surface and not in the rest-voltage window.

**The surprise.** On `Ai2020` only 3% of the lithium PyBaMM reports as "lost" is booked to plating or SEI. A short check shows the lithium leaves the particles only when the degradation models are switched on, but it is not counted as any side reaction. Earlier steps fitted their `Ai2020` forecasts to that total. Until we know where it goes, `Ai2020` should not count as a second plating cell.

**Limits.** These designs had been seen before. One node at end of charge summarises a whole profile, and on `NCA_Kim2011` it misses about a ninth of the decay. Every set uses OKane2022's plating parameters, and all of this is model fade, not measured cells.

**Next.** Predict the separator-surface shift from the first ten cycles, which show it already. Then rerun the forecast with that shift, pre-registered on fresh LG M50 pools.

Code and data: [`research/cell-fidelity`](../../research/cell-fidelity/), `experiments/mechanism/`.
