---
title: "Quality audit round 35: none of four sampled subjects meets the bar, and one fails on a wrong number"
seo_title: "Quality audit round 35: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of four sampled subjects meets the senior-professional bar. Three fail on tests that miss seeded bugs; a tire-shop calculator misparses prices over $1,000."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-10 (mode `sample`). No flagship or platform directory was drawn: all were audited within the skip window.

## The number

**None of the four uniformly sampled subjects meets the bar** (two ventures, two research projects; with n = 4 the Wilson 95% interval is about 0% to 49%). After this round the running estimate across all sampled subjects is 25 of 154 (11% to 23%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ghost-kitchen-brand-picker | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| ventures/tire-shop-ticket-margin-calculator | 2 | 3 | 3 | 3 | 3 | 2 | 3 | no |
| research/invthrust-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/qual-negint | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

## Subject by subject

- **ghost-kitchen-brand-picker** (verification 2). The optimiser is right: an exact-fraction brute force over all subsets matched `analyze()` on 300 random instances with 0 mismatches, and the smash-burger example recomputes by hand to $6.86 per order and $5,249.43 a month. But 6 of 10 seeded bugs survived, including `WEEKS_PER_MONTH = 4`, which makes every monthly figure 7.7% low with all 25 tests green. Labour is also charged on prep minutes only, not staffed hours.
- **tire-shop-ticket-margin-calculator** (correctness 2). Worst defect of the round: `Tires,$1,200,800,60,100` parses as price $1, parts $200, 800 labour minutes, so a thousands comma silently shifts every field. A tire set over $1,000 is the tool's main line, and the output looks plausible. Its arithmetic otherwise recomputes (average ticket net 213.6025 matches Python); 5 of 6 seeded bugs were caught, and the survivor removes the card-fee factor from the discount's lost net, because the discount test runs at 0% fee.
- **research/invthrust-twin** (verification 2). The numbers reproduce byte for byte and the 0.0460 overshoot matches the closed form exp(-pi*0.7/sqrt(1-0.49)) = 0.04599. But no test covers the linear inverse when the assumed exponent differs from 2, the project's headline regime: changing `n_hat * g` to `2 * g` leaves all 7 tests green. The 1.5 to 2.5 exponent range is assumed, not sourced, and the nearest prior work (PX4's thrust-curve blend) is not cited. A small sensitivity sweep, below the programme's PhD bar.
- **research/qual-negint** (verification 2). Reproduces byte for byte (45 s); the Wilson constants in the tests match a hand formula. Two seeded bugs survived: `plus_two` with `(x+1, n+1)` and a 0.5 stratum weight, which feeds every coverage number. The result is Brown, Cai and DasGupta (2001) applied to one estimator on one population; the weighted-Wilson literature is not cited.

## What binds

Verification again: three of four fail on it alone, and the fourth fails on a wrong number. The pattern from earlier rounds holds: the outputs are mostly right, and the tests would not notice if they stopped being right.

## What changed

One fix in this PR: ghost-kitchen-brand-picker gets a test pinning `WEEKS_PER_MONTH = 52/12`, the per-order profit and the example's $9,026.67 optimum. With the constant mutated to 4 the new test fails and the suite was otherwise green. The other defects (the comma parsing, the discount test at a non-zero fee, the two `qual-negint` tests, the `invthrust-twin` exponent test) are recorded in the audit files and not yet fixed; a later round re-audits.
