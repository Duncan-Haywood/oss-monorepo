---
title: "A slower lithium-loss law fixes the battery ranking, not the screen"
date: 2026-11-15
tags: [cell-fidelity, batteries, simulation, pybamm, lithium-plating, capacity-fade, pre-registration]
seo_title: "Lithium-ion fade from ten DFN cycles with a square-root loss law"
description: "A + b√n lithium loss lets an electrode-balance map rank 100-cycle DFN energy at 0.61 to 0.94 on 11 of 13 pools, but it misses the best design by up to 3.2%."
---

This morning's [post](2026-11-15-the-battery-map-was-right-the-extrapolation-was-not.md) ended with a clear diagnosis. The `cell-fidelity` programme has an electrode-balance map that turns the lithium a lithium-ion design loses into the energy it loses. Fed DFN's real lithium loss at cycle 99, it is accurate. Fed a power law fitted to the first ten cycles, it is badly wrong, because plating slows down and the power law does not. The power law over-predicted the cycle-99 loss by 1.2 to 2.8 times.

So the obvious next step was to try a law that slows down. Testing it needed no new simulation: the ten-cycle lithium curves, the balance tables and the true 100-cycle results were all already in the repository.

**Choosing the law.** We had 27 designs whose lithium loss was known all the way to cycle 99. On those alone, looking only at lithium, we compared six laws fitted to cycles 2 to 10. The best was a + b√n, the textbook form for growth of the SEI film. Its median prediction of the cycle-99 loss was 0.75 to 1.04 of the truth on the three graphite cells, against 1.6 to 1.9 for the power law. It was still 1.66 on the NCA cell, whose loss slows down faster. We wrote that choice and five predictions into the [log](../../research/cell-fidelity/LOG.md), then scored them on the 13 pools those 27 designs did not come from.

**What came out.**

- **It is the fix for the ranking (supported).** With the square-root law, the map ranks the 100-cycle DFN energy better than with the power law on 12 of 13 pools. With 13 pools, 12 wins has a sign-test p of 0.003.
- **It beats the plain curve fit on ranking 8 times in 13 (mixed).** We had set the bar at 9. The gains are large where the curve fit is weak: Spearman 0.81 against 0.58 on one `Ai2020` pool, 0.90 against 0.57 on two pools at twice the current. The two NCA pools go the other way, as the dev numbers warned.
- **It does not predict how much the cells fade (refuted).** It is closer than the curve fit on only 6 of 13. On the two NMC811 cells it predicts about half the real fade; on NCA it predicts almost total fade.
- **It is not a safe screen (refuted, twice).** The procedure keeps the top 4 designs by cycle-10 energy plus the top 4 by a fade prediction. With this map as the fade prediction, it missed the best design by 3.2% on one pool, 2.2% and 1.2% on two others. The current procedure, which uses a square-root fit of the energy curve, is within 0.16% on all 13.

We also tried, without registering it in advance, keeping three lists instead of two. That matched the current procedure's worst case and cost about 2.4 more full runs per pool, so it buys nothing.

**What it means.** Most of what the map lacked as a ranker was a loss law that slows down. On eight graphite pools where the curve fit ranks designs at 0.70 or worse, the map now ranks them at 0.61 to 0.90. Two things are still missing before it can drive a screen. One is a way to pick the law from the curve itself: the early growth exponent already tells the NCA cell (about 0.25) from the graphite cells (about 0.85). The other is a rate term for the NMC811 cells, where the open-circuit map under-counts the fade. Until a version passes on pools nobody has looked at, the square-root energy screen stays.

**Limits.** These pools' 100-cycle results were read by earlier steps; what was new was the predictor's output. The law was picked on 27 designs from the same family of pools. Seven of the 13 test pools are ones where the cycle-10 list alone already finds the best design, so they test the fade list less. All of it is one PyBaMM version and PyBaMM's plating model, not measured cells.

The numbers, the plan and the script are in the programme's [log](../../research/cell-fidelity/LOG.md) and [README](../../research/cell-fidelity/README.md).
