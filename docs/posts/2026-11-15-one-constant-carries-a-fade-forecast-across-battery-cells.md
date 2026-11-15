---
title: "One constant carries a ten-cycle fade forecast to other battery cells; a second one does not"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration, transfer]
seo_title: "Does a ten-cycle battery fade forecast transfer to other cells?"
description: "Recalibrating one constant on 8 designs lets a ten-cycle DFN fade forecast rank three new cells at Spearman 0.76 to 0.94. Its slope does not transfer."
---

The `cell-fidelity` programme asks how a lithium-ion electrode design search can spend less on PyBaMM's full DFN battery model and still find the best design. Its last step built a forecast that reads only the first ten DFN cycles of a design and predicts its energy at cycle 100. The forecast has two parts:

- **An electrode-balance map.** It turns lithium lost into energy lost, using only the design and the cell's open-circuit curves.
- **A forecast of the lithium lost by cycle 99.** It extrapolates the ten-cycle loss curve, then applies a correction for loss that slows down as a design loses more: L<sub>corr</sub> = L<sub>law</sub> / exp(A + S ln(L<sub>law</sub> / n<sub>Li</sub>)).

With A and S fitted on one cell (`Ai2020`) and frozen, the forecast ranked three fresh pools of that same cell at Spearman 0.92 to 0.96. A plain square-root fit to the energy curve managed 0.59 to 0.67. But that was the cell the constants came from. The open question for an engineer with a different cell: what does it cost to move the forecast over?

**What we checked before running anything.** We tried this on pools that were already committed. Refitting both constants from 8 designs was unstable: on one `NCA_Kim2011` pool the fitted slope ranged from &minus;0.4 to 2.1 across random choices of the 8. Refitting only the intercept A, with S kept from `Ai2020`, was stable. So that is what we pre-registered: run 8 designs of the new pool to cycle 100, set A from them, and score the other 56.

**What we ran.** We took 64 fresh designs on each of three cell sets the correction had never seen: `NCA_Kim2011` at 0.875&times; current, and `Chen2020` and `OKane2022` (both parameterisations of the LG M50 cell) at 1.5&times;. That is 192 DFN runs with SEI growth and lithium plating, 100 cycles each, about 33 minutes on 4 cores. No run failed.

**What came out (held-out designs):**

| pool | &radic;cycle energy fit | forecast, A from 8 designs | forecast, `Ai2020` constants | raw cycle-10 energy |
|---|---|---|---|---|
| `NCA_Kim2011@0.875x` | &minus;0.42 | 0.76 | 0.80 | 0.96 |
| `Chen2020@1.5x` | 0.80 | 0.94 | 0.94 | 0.93 |
| `OKane2022@1.5x` | 0.80 | 0.94 | 0.93 | 0.93 |

- **Ranking carries (supported).** The recalibrated forecast beat the square-root fit on all three pools. It also did so in 149 of 150 random choices of the 8 calibration designs.
- **The intercept has to move (supported).** With the frozen `Ai2020` constants, the forecast of cycle-99 lithium loss was off by a median of roughly 8%, 23% and 25% (log error 0.08, 0.23, 0.25). Recalibrating A cut that to roughly 5%, 9% and 9%.
- **The slope does not carry (mixed).** On the two LG M50 sets the remaining error is above our 6% bar. Those sets want a slope of about 0.35, not `Ai2020`'s 0.58 (`NCA_Kim2011` wants 0.7 to 0.9). A two-constant refit on the same 8 designs gets the lithium loss within 3% on those sets. Yet it ranks slightly worse, and its worst case over random draws is clearly worse. For ranking, one stable constant is the better buy; for the size of the fade, the slope matters.

**The honest catch.** On these three pools the energy at cycle 10 already ranks the designs at 0.93 to 0.96, and each pool's best design is in its top 3 there. So the screen found the best design every time, but it would have without any fade forecast. These pools show the forecast transfers, not that it is needed on them. The cell where it is needed is fade-limited `Ai2020` at low current, where cycle-10 energy ranks as low as 0.36.

**What it means for a designer.** Moving the forecast to a new cell costs 8 extra 100-cycle simulations, and that is enough to rank designs. Forecasting how much energy they will lose needs the slope too, and the slope differs from cell to cell in a way nobody has derived yet. That is the programme's next step: get S from the plating law itself, with 0.35, 0.58 and 0.7 to 0.9 as the values it must reproduce.

**Limits.** One pool per cell set, so 3 of 3 wins gives a sign-test p of only 0.25. The two LG M50 sets are one cell parameterised twice. The fade is PyBaMM's plating model, with OKane2022's plating parameters on every set, not measured cells. We used one PyBaMM version (26.10.1.1).

The plan, written before the bench ran, the outcome and the numbers are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
