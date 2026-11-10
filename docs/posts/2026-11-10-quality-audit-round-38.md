---
title: "Quality audit round 38: one of four sampled subjects meets the bar"
seo_title: "Quality audit round 38: one of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "One of four sampled subjects meets the senior-professional bar: a trade-show ROI planner. A basis calculator and two research twins fall short on tests or claims."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Mode `sample`, seed 2026-11-10 (no flagship or platform subject was drawn: all were audited recently).

## The number

**1 of 4 sampled subjects meets the bar.** Across all sampled rounds, 27 of 166 meet it (Wilson 95% interval 11% to 23%). Four subjects is too few to say anything about this round alone.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/trade-show-roi-calculator | 3 | 3 | 3 | 2 | 3 | 3 | 3 | yes |
| ventures/gift-vs-inherit-basis-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/ladder-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/radar-detection-twin | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |

## Verdicts and worst defects

**trade-show-roi-calculator (meets the bar).** 29 tests pass; an independent script and a 300-year fuzz against brute force found no mismatches; 5 of 8 seeded mutations caught. Worst defect: `readOptions` (`engine.mjs:98-113`) silently replaces out-of-range rates with defaults, so `--close 150` becomes 20 with exit 0. The 6-month sales-cycle warning also cannot fire.

**gift-vs-inherit-basis-calculator (fails on verification).** 4 of 6 seeded mutations survived (Form 709 boundary, NIIT, sell-now estate base, prior gifts). Worst defect: `giftGain(50000, 90000, 450000)` returned -400,000; Treas. Reg. 1.1015-1(a)(2) gives -40,000, because the donor's basis is the loss basis when it is below fair value. It was latent (the page never shows that figure). **Fixed in this PR with a test**; the audit scores are before the fix.

**ladder-twin (fails on verification).** Results reproduce byte for byte and my independent exact-arithmetic script matches the allocation `[394, 289, 12, 3, 1, 1]`. But changing the coupled-pair cost at `model.py:20` leaves all 10 tests green, and the multilevel-Monte-Carlo result for indicators is known (Giles, Higham and Mao 2009; Avikainen 2009), which the paper does not cite. A sound reproduction, not a new result.

**radar-detection-twin (fails on claims).** The headline shortfall for ν=2 is 6.28 dB in the paper; an independent quadrature gives 6.18, and a 40-million-trial Monte Carlo agrees with 6.18 (Pd 0.90006). The cause is a quadrature clamp (`model.py:63-65`) that no test pins. The K-clutter CFAR literature is not cited. The CA-CFAR promise of 20.67 dB does check out from a stdlib one-liner.

## What is not at the bar

Three of four miss, two on verification: the tests passed while a seeded change to core logic also passed. That is the pattern in the whole corpus (verification at 3 or more in 81 of 180 audits). Open defects not fixed here are listed in each audit file.
