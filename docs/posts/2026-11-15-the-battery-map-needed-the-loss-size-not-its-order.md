---
title: "The battery map needed the size of the loss, not its order"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Li-ion fade from ten DFN cycles: a self-limiting loss correction"
description: "A two-constant correction of a ten-cycle lithium-loss forecast lets a balance map rank 100-cycle DFN energy at 0.92 to 0.96 on fresh designs."
---

[This morning's post](2026-11-15-fresh-battery-pools-the-map-is-right-the-per-design-fit-is-not.md) ended with a diagnosis. In the `cell-fidelity` programme, an electrode-balance map turns the lithium a lithium-ion design loses into the energy it loses. Fed each design's true lithium loss at cycle 99, the map ranks designs by their 100-cycle energy almost perfectly. Fed a loss forecast from the first ten cycles, it ranks them worse than a plain curve fit of the energy. The suggested fix was to rank the lithium loss better.

That turned out to be the wrong target. On the same committed results, the ten-cycle forecast already ranks the cycle-99 lithium loss at a Spearman of 0.98 to 0.99. The order was fine. The trouble is that the map is very sensitive to the *size* of the loss. Multiply each design's true loss by a random 10% error and the map's ranking of the energy falls from 0.96 to between 0.38 and 0.67. Designs near the top differ by small margins, and a small error in how much lithium is gone moves them past each other.

The forecast's error also isn't random. It over-predicts most for the designs that lose the most lithium, which is what you would expect if the loss slows down as the cell loses more (lithium plating tends to do that). A single straight line in log space captures it: the forecast's overshoot against the fraction of lithium it predicts lost. We fitted that line's two constants on the three `Ai2020` pools from the morning's run and froze them.

**The test.** We used 64 new electrode designs (a Sobol sample with a seed no earlier step used) at three charge currents, 0.35, 0.45 and 0.6 times the reference. Nobody had run the last two. Every design ran the full DFN model in PyBaMM with SEI growth and lithium plating for 100 cycles, 192 runs in about 54 minutes on four cores. The forecast read only the first ten cycles. The correction, the pools and four predictions were written into the [log](../../research/cell-fidelity/LOG.md) before the first run.

**What came out.**

- **The corrected map ranks the 100-cycle energy at 0.92, 0.96 and 0.96 (supported).** The square-root energy fit the programme has used as its fade predictor gets 0.67, 0.62 and 0.59. The uncorrected map gets 0.61, 0.68 and 0.82, and the map fed the true loss 0.96 to 0.97.
- **The loss forecast is within about 4% (supported).** The median cycle-99 lithium-loss error is about 4% (a log error of 0.036 to 0.040), down from 11 to 18%.
- **As a screen it finds the best design every time, with fewer resumed runs (supported).** The screen resumes the top 4 by cycle-10 energy plus the top 4 by the corrected map to cycle 100. It found the true best on all three pools, as the current procedure does, but resumed 6.3 designs on average against 7.7.
- **The sensitivity holds, but less at high current (mixed).** The 10% error costs the map 0.52, 0.37 and 0.19 of Spearman. At 0.6 times the reference current, fade is smaller and the cycle-10 energy alone already ranks the 100-cycle energy at 0.98.

A user with a new pool doesn't have frozen constants. So we also refitted the two constants from 8 designs per pool run to cycle 100. They barely moved, and the ranking stayed at 0.93 to 0.96.

**What it means.** This is the programme's first ten-cycle fade predictor that beats the energy fit on every fresh pool. It matters most where fade decides the order: at 0.35 times the current, the cycle-10 energy alone ranks the designs at only 0.53.

**Limits.** It covers one cell parameter set, the one the constants came from. On the NCA cell the morning's data already shows a different slope (0.81 against 0.58), so each set needs its own calibration. The correction is empirical, with no mechanism behind it yet. Three pools is a small sample (3 wins out of 3 gives a sign-test p of 0.25). The plating parameters come from one published cell, everything ran on one PyBaMM version, and the fade is modelled, not measured. Next: fresh NCA and NMC811 pools with constants calibrated on 8 designs each, and a self-limiting plating law that predicts the slope instead of fitting it.

Plan, numbers and script: the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
