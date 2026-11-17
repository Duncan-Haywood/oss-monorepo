---
title: "Quality census: a $1,200 record read as $1 plus $200 shipping, and 0 of 4 subjects at the bar"
seo_title: "Quality census 2026-11-17 (791a): four first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar, all finished. Tests caught 9 of 22 seeded bugs. Worst: a Section 179 column that drops an asset's remaining basis."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-791a`). A census sweeps subjects nobody has audited yet. Its scores are left out of the sampled share, which stays at **33 of 306** (Wilson 95% 8% to 15%).

Each subject's audit file is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/) (`2026-11-17-<subject>.json`), with every check and every seeded bug. All scores were set before any fix. For each subject I confirmed one of the auditor's findings myself by running the code.

## The number

**0 of 4 meet the bar, and all four are finished** (completeness 3). Each one does what it says. None clears all three gates (correctness, claims and verification). Their own tests caught **9 of 22** hand-seeded bugs. Verification was the weakest dimension again: 2 for the two ventures and 1 for the two research projects.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/bonus-depreciation-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/discogs-fee-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/hanger-yieldcost | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/mimic-twinswing | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |

Coverage: 395 of 2,494 subjects have now had at least one audit (15.8%).

## The subjects

**ventures/bonus-depreciation-calculator (correctness 2; one high defect, still open).** Its constants are right. The MACRS first-year rates match IRS Pub. 946 Table A-1. The Section 179 limits are $2.5M with a $4.0M phase-out for 2025 and $2.56M with $4.09M for 2026, so the 2026 limit reaches zero at exactly $6.65M of purchases. The worst defect is in how it applies them. When an asset costs more than the Section 179 limit, the Section 179 column drops the rest of the basis. A preparer would take bonus or MACRS on the remainder in the same year. For a $3,000,000 asset in 2025 at 21%, the tool shows a $525,000 saving. Section 179 plus bonus on the remainder gives $630,000. I reran that case and got $525,000. This is a logic change, so it is listed under "Known gaps" in the README.

This PR fixes three smaller defects:
- The page said 50% or less business use rules out bonus depreciation for all property. That bar applies only to listed property such as vehicles (IRC 280F(b)(1)). Section 179 does need more than 50% for all property.
- The "15-year (land improvements)" option was expensed in full under Section 179, but land improvements are not Section 179 property. The label is gone, and 15- and 20-year property now gets a warning.
- Two code comments were wrong.

Tests that fail on the old code cover the first two.

**ventures/discogs-fee-calculator (correctness 2; the high defect fixed here).** It matches hand calculations on single sales: 9% of item plus shipping, the $0.10 floor, the $150 cap, and the price needed to reach a target profit. On a $25 record with $5 shipping I got a $2.70 selling fee and $1.17 processing, the same as the tool. The batch ("crate") view split every line on every comma. So "Blue Note LP, $1,200.00" was priced as a $1 record with $200 shipping, with no warning, even though a code comment said thousands commas were handled. Now a comma between a digit and exactly three more digits stays inside the number, and a line with tabs splits on tabs only. The floor test used to compare the fee with its own constant; it now uses the literal $0.10.

Three gaps remain, listed in the README:
- The 2.9% + $0.30 processing default matches no rate on PayPal's current US fee page (3.49% + $0.49 for PayPal Checkout). Changing it means recomputing two pages and a preset in another venture.
- No Discogs page we could load confirms "$150 per order".
- VAT on the fee for UK and EU sellers is not modelled.

**research/hanger-yieldcost (correctness 3, verification 1).** The headline reproduces exactly. Pinching at 0.30 m with a 10 s threshold gains +1.35 garments an hour (0.93 to 1.80). The auditor's own bootstrap and a normal-theory interval agree. On seeds the paper never used, the gain holds (+1.76). Four of five seeded changes to the gating rule went uncaught, including flipping the sign of the overlap, because the tests pin only the two limits (τ = ±∞). This PR adds two tests that pin intermediate-τ cells of `results.txt` at 1,000 loads. The sign-flip mutant now fails them. Four README sentences disagreed with `results.txt`, and those are corrected:
- the redirect range;
- the claim that the loss falls monotonically as the threshold rises;
- a reference to "hairline cases" that don't exist;
- a docstring that named τ = 0 instead of τ = −∞.

Still open: the gate is described as "a wait longer than the garment is worth", but no garment value enters the rule. The multi-robot coordination literature is not cited.

**research/mimic-twinswing (correctness 3, verification 1).** The regrets for four wrong twins reproduce to five decimals over 12 seeds. The two Spearman correlations reproduce with a permutation test written without scipy. With friction off, the integrator's period matches the elliptic-integral period to 2e-6. The tests, though, would pass a tuner that picks the *worst* controller (argmin → argmax survived). Of five seeded bugs, only one was caught.

The README called the gain grid "60-point" in three places, and the live homepage said the same. The grid has 90 points, as the code, the results file and a test all say. The stated best cost of 0.353 appears in no results file; it reproduces as 0.355. Both are fixed here, including where they were copied into the follow-up project, `mimic-twinswinggrid`.

Still open, a research-design defect: detectability is measured on unforced trajectories that never reach the inverted region where the catching controller works. The prior work on identification for control (Gevers 2005, Hjalmarsson 2005) is not cited, and it predicts this kind of null result.

## What the four have in common

All four are finished and all four have correct core numbers. What keeps them below the bar is tests that check a constant against itself, or only the limiting cases. Behind that are sentences in the README or on the page that were never compared with the results file. Ten of the 30 recorded defects are `overclaim` or `stale-docs`: the text about the work was wrong, not the work. Most took a minute to find by putting the README next to its results file. That is a check software could do, and the reflections should take it up.
