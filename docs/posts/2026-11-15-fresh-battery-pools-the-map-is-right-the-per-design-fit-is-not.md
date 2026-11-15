---
title: "On fresh battery pools, the map is right and the per-design fit is not"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Predicting 100-cycle Li-ion fade from ten DFN cycles on unseen designs"
description: "On 241 unseen designs a balance map fed the true lithium loss ranks 100-cycle DFN energy at 0.95 to 0.97; fed a ten-cycle fit, at 0.64 to 0.76."
---

Today's [earlier post](2026-11-15-a-slower-loss-law-fixes-the-battery-ranking-not-the-screen.md) left the `cell-fidelity` programme with two open items. Its electrode-balance map turns the lithium a lithium-ion design loses into the energy it loses. A square-root lithium-loss law fitted to the first ten cycles had fixed most of the map's ranking. But that law was chosen on designs from the same family as the test, scored against results earlier steps had already read, and it was wrong on the NCA cell.

So this step did two things. It let the ten-cycle curve choose the law, and it tested on pools nobody had seen.

**The setup.** We used 64 new designs (a Sobol sample with a seed no earlier step used) at four conditions: the `Ai2020` cell at 0.3, 0.4 and 0.5 times the reference current, and the NCA cell at 0.625 times. Every design ran the full DFN model with SEI growth and lithium plating for 100 cycles, recording its lithium loss each cycle. That was 256 runs and about 90 minutes on four cores. The screen saw only the first ten cycles. The rule for choosing the law, the pools and five predictions went into the [log](../../research/cell-fidelity/LOG.md) before the first run. The rule: if a pool's median growth exponent over cycles 2 to 10 is at least 0.6, use a + b√n; otherwise use a power law.

**What came out.**

- **The rule chose as predicted, and the law holds out of sample (supported).** It took √n on the three `Ai2020` pools (exponents 0.86 to 0.90) and the power law on NCA (0.25). The median predicted cycle-99 lithium loss was 1.05, 0.99 and 0.94 of the truth on `Ai2020`.
- **The ranking still loses to the plain curve fit (refuted).** The map beat the square-root fit of the energy curve on 1 of 4 pools. On `Ai2020` it ranks the 100-cycle energy at 0.64 to 0.76.
- **The fade size is worse too (refuted),** on 3 of 4 pools.
- **As a screen it is close, but not safe (mixed, and refuted against the incumbent).** The screen keeps the top 4 by cycle-10 energy plus the top 4 by the map. It found the best design on three pools and missed by 1.25% on the fourth. There the current procedure was exact; on another pool the current procedure missed by 0.87% and the map's version did not.

**The useful number is one we registered as descriptive.** Fed each design's true cycle-99 lithium loss, the same map ranks the 100-cycle energy at Spearman 0.95 to 0.97 on all four pools, NCA included. On NCA every energy-curve extrapolation ranks designs backwards. An earlier step checked this decomposition on 27 designs; it now holds on 241 nobody had looked at.

So the map is right, and the law is right on the median. What loses the ranking is the fit for each design. After the verdicts we looked at how far each design's predicted loss lands from its true loss: from about 0.8 to 1.45 times on `Ai2020`, between the 10th and 90th percentiles. Ten cycles do not pin down, design by design, how fast the loss will slow.

**What it means for the procedure.** Nothing changes yet. The current screen (top 4 by cycle-10 energy plus top 4 by a square-root fit of the energy curve) stays. Keeping three lists of 4 found the best design on all four pools, but it resumes 11 designs per pool where the current screen resumes 7.8. The next predictor should share the curvature across a pool (one curve shape, a scale per design), or read cycle 20 only for designs the two lists leave out. It should be scored first on whether it ranks lithium loss, since the map turns a good lithium ranking into a good energy ranking.

**Limits.** Four pools is a small sample: even 4 wins out of 4 would only reach a sign-test p of 0.125. The solver dropped 15 designs on the two lowest-current pools. The plating parameters come from one published cell and are reused on both sets. Everything ran on one PyBaMM version and is modelled, not measured.

Plan, numbers and script: the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
