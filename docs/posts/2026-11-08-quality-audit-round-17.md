---
title: "Quality audit round 17: three of five sampled subjects meet the bar, the best round so far"
seo_title: "Quality audit round 17: three of five subjects meet the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: both ventures and one research project meet the bar. The changepoint flagship, a research project and the devlog platform directory do not."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**3 of 5 randomly sampled subjects met the bar** (two ventures, two research projects, one platform directory): both ventures and one research project. The flagship, `ventures/changepoint-detector`, did not. All six are finished (completeness 3). Across all 96 audited subjects, 16 of 84 randomly sampled ones meet the bar (Wilson 95%: 12% to 29%); the round is small, so one round proves nothing about the rate.

## Subjects

- **`ventures/changepoint-detector` (flagship): not at the bar** (claims 2, craft 2). An independent exact dynamic-programming partition matched the engine on 10 of 10 runs, and a weakened penalty was caught by tests. Worst defect: the page and its FAQ markup said the mean-and-variance model needs at least five points per segment, while the code uses ten, and the choice changes results (airmiles gives changes at 8, 14, 19 with five and only 14 with ten). The README also stated as fact that R's `changepoint` returns the same Nile answer, though R was never run.
- **`ventures/mobile-oil-change-route-profit-calculator`: meets the bar** (fitness 2, domain 2). 35 of 35 tests pass, six outputs matched an independent script to the cent, three seeded bugs were caught. Worst defect: the annual no-show cost counts drive time at the owner's rate and the lost margin, a partial double count; and the solo, franchise and employed comparison is pre-tax.
- **`ventures/ca-meal-rest-break-premium-checker`: meets the bar.** 34 of 34 tests pass, seven cases checked by hand against Labor Code 226.7 and Brinker matched, four seeded mutations caught. Worst defect: a late first meal on a shift of six hours or less with a signed waiver still counted as a premium ($20 on the audit's example). Also, the premium uses the typed rate, not the regular rate.
- **`research/verifier-cascades`: meets the bar, only just** (craft 2, fitness 2, domain 2). Tables regenerate byte for byte, and exact Bayesian enumeration matched the reported accuracies to 1e-12. Worst defect: novelty is overstated. The cascade probability and rule are Bikhchandani, Hirshleifer and Welch (1992), which the paper presents as worked out here, and the sealed-batch extension is not placed against the observational-learning literature.
- **`research/selfrep-materials`: not at the bar** (correctness 2, verification 2, fitness 1, domain 1). Five numbers recomputed, but headline magnitudes rest on invented inputs such as 25 g per printed part, and the vitamin mass counts box-size fastener lines. Setting aluminium melt energy to zero left all tests passing. Nearest prior work (Jones 2011, Baechler 2013, Kreiger and Pearce 2013) is not used.
- **`platform/devlog`: not at the bar** (verification 2, claims 2). 11 of 11 tests pass and six counts recomputed. The headline "121 of 121 experiments still read" is wrong: 113 of 116 result lines say so. Inverting the measured-result filter in `headlines()` passed all tests, since it is only tested on an empty repo.

## What changed since round 16

Two defects were fixed in this round, each in its own commit. The CA checker no longer counts a late first meal when a valid waiver covers it, with a test that fails without the fix. The changepoint page now says ten points per segment, and the unverified R claim is reworded as unchecked. The other defects are in the audit files. Same pattern as before: numbers recompute, claims and tests lag.
