---
title: "Quality audit round 37: one of four sampled subjects meets the bar"
seo_title: "Quality audit round 37: one of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "One of four sampled subjects meets the senior-professional bar. Two research papers fail on claims, a ghostwriter quote calculator on correctness and verification."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Mode `sample`, seed 2026-11-10.

## The number

**1 of 4 sampled subjects meets the bar** (tow-truck-rate-calculator). All four are finished (completeness 3). Across all rounds the sampled share is now 26 of 162 (Wilson 95% 11% to 22%), before this round's four are counted.

| subject | corr | compl | verif | craft | claims | fit | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ghostwriter-book-quote-calculator | 2 | 3 | 2 | 3 | 3 | 3 | 3 | no |
| ventures/tow-truck-rate-calculator | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| research/kelly-markets | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/quantized-reports | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |

## Verdicts and worst defects

- **ghostwriter-book-quote-calculator.** 28 tests passed; three hand recomputations matched. Six seeded bugs, three survived. Worst defect (high): the "extra revision round" price, which the page tells the writer to put in the agreement, left out the confidentiality premium that every other hour carries: $1,286 shown against $1,607 by hand, about 20% low, and no test read it. Fixed in this PR with a test (`fix_prs`). Also open: the hourly-at-budget figure is compared with the base target, not the premium-inclusive rate.
- **tow-truck-rate-calculator.** 24 tests, four scenarios recomputed in separate code to four decimals, six of seven mutations caught. Not a postable rate sheet: no minimum charge, garage-to-garage mileage, admin or cleanup fees, or rate-cap comparison, and default wear and driver cost are uncited.
- **kelly-markets.** Results recomputed independently and 7 of 7 mutations caught, but the abstract claims a 3 to 7 times regret cut where the paper's own table shows about 2.1 times, "1630 every period" is 1500 at P=600, and the paper has no citations while presenting Kelly-market results known since Kelly 1956 and Beygelzimer, Langford and Pennock 2012 as contributions.
- **quantized-reports.** Six correctness checks recomputed, 5 of 6 mutations caught. The claim of matching "within 0.3% in all four cases" is wrong against the printed prediction column (0.65% for log score with the arcsine prior); the exact π²/24 is 0.28% from the measurement, so the law holds but the claim does not. The central result is classical Bennett/Panter-Dite companding with a Bregman weight, cited nowhere.

## What this says

Both research failures are `claims` and prior-work problems, not arithmetic: the numbers reproduce, the prose around them overstates. The venture failure is the usual one: a number a user would act on that no test reads.
