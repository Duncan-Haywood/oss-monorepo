---
title: "The battery map was right; the extrapolation was not"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration, negative-result]
seo_title: "Can ten DFN cycles predict lithium-ion capacity fade at cycle 100?"
description: "Ten DFN cycles over-predict the cycle-99 lithium loss up to 2.8 times, because plating slows down. The electrode-balance map it feeds is accurate."
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search can spend less on PyBaMM's full DFN battery model without losing the best design. Its current procedure runs every design to cycle 10. It then runs two short lists to cycle 100: the top 4 by cycle-10 energy, and the top 4 by a square-root-of-cycle fit to the energy curve. On the pools tested so far, that finds the best design to within 0.32%.

The square-root fit is a curve fit with no physics in it. The previous step gave us a candidate with physics in it. Fade in these simulations comes from lithium plating. How much energy a design loses for each mole of lithium it loses depends on its electrode balance. A map built only from the parameter set and the design (both electrodes' capacities, the cyclable lithium and the two open-circuit voltage curves) turned DFN's own lithium loss into its energy loss to within 0.05 on 34 of 40 fresh designs.

**The idea.** The ten-cycle runs already record how much lithium each design has lost. Fit a power law, L(n) = a n<sup>b</sup>, through cycles 2 to 10. Read it at cycle 99, and let the map turn that into the energy left at cycle 100. That costs under a millisecond per design, so it would be a free replacement for the curve fit.

**What we predicted, then ran.** We wrote down four predictions and ran DFN for ten cycles on 1,108 designs from 17 pools that had already been run to cycle 100. The fresh runs reproduced the committed cycle-10 energies exactly. Every prediction failed.

- **Ranking (refuted).** The map's prediction ranked the cycle-100 energy better than the square-root fit on 2 of 17 pools. On the fade-heavy `Ai2020` pools it scored a Spearman correlation of 0.27 to 0.55, against 0.57 to 0.76 for the curve fit.
- **Size of the fade (refuted).** It got closer to the true fade on 7 of 17, and on none of the eight `Ai2020` pools. There it predicted 87 to 99% fade where DFN shows 45 to 56%.
- **As a screen (refuted).** Swapped in for the curve fit, it missed the best design by up to 6.9%. The current procedure is within 0.32% on all 17.

**Why.** After the verdicts we ran 27 designs to cycle 100 and recorded their lithium curves. That split the error in two:

- **The map holds up.** Fed DFN's own cycle-99 lithium loss, it lands within a mean 0.02 to 0.05 of DFN's fade from cycle 10 to 100 on `Ai2020`, `Chen2020` and `NCA_Kim2011`. On `OKane2022` it is 0.12 short.
- **The extrapolation is the problem.** Fed the power law, the map is off by 0.34 to 0.43. Plating slows as the cell ages. The loss grows about as n<sup>0.85</sup> over cycles 2 to 10 but only as n<sup>0.24 to 0.63</sup> over cycles 50 to 99. So the power law over-predicts the cycle-99 loss by 1.2 to 2.8 times.

**What it means for a designer.** The electrode-balance half of the fade problem looks solved wherever the cell runs close to its open-circuit voltage. The half still open is the rate at which lithium is lost. Ten cycles are too early to see that rate slow down. A useful predictor needs a loss law that slows itself down, or a curve read at cycle 20 or 30, after the slowdown has started. Until one passes a test like this, the square-root screen stays.

**Two slips, disclosed.** Two of our older pools store energy per kilogram with a mass of 1. Our first report divided the fresh energies by that 1, so it ranked those pools in watt-hours, not watt-hours per kilogram. We fixed the report and the verdicts did not change. The rule that picked the 17 pools had the same slip, so 9 of them are pools where the raw cycle-10 list already finds the best design. On the 8 that meet the rule as intended, the map won on ranking once. Both slips are in the [log](../../research/cell-fidelity/LOG.md).

**Limits.** These are pools whose cycle-100 results earlier steps had already read; what was new was the predictor's output. The diagnostic covers 27 designs on four pools, chosen after the verdicts. All runs use one PyBaMM version. The fade is PyBaMM's plating model, with OKane2022's plating parameters copied to six of the seven cells, not measured cells.

The plan, the outcome and the numbers are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
