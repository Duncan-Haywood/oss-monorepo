---
title: "Quality audit round 59: 0 of 4 at the bar, and an allergen labeller that did not know sea bream was fish"
seo_title: "Quality audit 59: allergen fish gap, Stripe deposit, CFAR Pd"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. An allergen label tool missed common fish and dropped supplier tags; a Stripe tool read 1,234.56 as 1.23."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-13-*` files with seed `2026-11-13-e`. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 58 had already used seeds `2026-11-13` to `-d`, so this one took `-e`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 250 meet it (Wilson 95% interval 9% to 17%). Three of the four are finished (completeness 3). All four miss on verification. The two research projects get their main numbers right; both products have a defect a user would act on.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/stripe-payout-to-journal | 2 | 3 | 2 | 2 | 2 | 2 | 3 | no |
| ventures/allergen-label-maker | 1 | 2 | 2 | 2 | 1 | 2 | 2 | no |
| research/cfar-family-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/eda-gridorder | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| stripe-payout-to-journal | 2 of 7 | 4 of 6 |
| allergen-label-maker | 3 of 6 | 1 of 11 (one partial) |
| cfar-family-twin | 2 of 5 | 5 of 5 |
| eda-gridorder | 1 of 5 | 6 of 6 |

The tests caught 8 of 23 seeded bugs. That is the same count as round 58 (8 of 23).

## Verdicts and worst defects

### ventures/allergen-label-maker (correctness 1, claims 1)

The reviewer is a food-labelling compliance specialist working to UK and EU law (Regulation 1169/2011 Annex II and Article 21, and the FSA's Natasha's Law guidance) and to US law (FALCPA and the FASTER Act). The tool gets the two allergen lists right. It caught all 25 ordinary named ingredients the auditor tried. It also handles the US rule that rye and barley are not wheat.

**The worst defects (high):**

- **Common fish were not fish.** Sea bream, turbot, eel, carp, skate, john dory, caviar and lox gave no finding at all. A sea bream dish showed "Not listed" for fish in the matrix, on the label and on the customer page.
- **Only the first supplier tag was read.** In `sauce (stock [celery], paste [soya])`, every tag was removed from the text but only the first was read, so the soya was lost.
- **`butter [none]` declared no milk.** The README said `[none]` only clears guesses.
- **US mode never declared pine nut or chestnut.** Both are on the FDA's tree-nut list (allergen Q&A, Edition 5, 2025).
- **The label used a shorter word list than the matrix.** Plain flour, brie, halloumi, groundnut and dijon went unbolded, while coconut milk and cocoa butter were bolded.

**Fixed in this PR**, each with a test. I re-ran the old and new engines side by side:

| input | old | new |
|---|---|---|
| sea bream | nothing | fish |
| `butter [none]` | nothing | milk |
| the two-tag sauce | celery | celery and soya |

The label now emphasises exactly what the matrix declared and prints supplier tags inside the ingredients list. The headline says "draft label" instead of "print-ready".

Still open, listed under "Known gaps" in the README:

- The "Contains" lines print category names, where FALCPA wants the species and FIC wants the specific cereal or nut.
- "Plain flour" is bolded as written instead of naming wheat.

### ventures/stripe-payout-to-journal (correctness 2)

The reviewer is a bookkeeper who closes month-end for Stripe merchants in Xero or QuickBooks. The journal engine is sound for an ordinary payout. Four hand recomputations matched to the cent:

- the sample's two month-split journals, totalling 559.54;
- an EUR refund that returns part of the fee;
- a dispute lost and then won;
- a JPY payout.

**The worst defect (medium):** the "Deposit in your bank" box parsed `1,234.56` as 1.23, so any payout of 1,000 or more typed with a thousands separator raised a false "does not add up" error. The hub tool `sales-export-to-journal` had the same bug. **Fixed in this PR** in both pages: they now use the engine's tested amount parser, and page tests pin it. The page also now says that Xero's journal import matches account codes (up to 10 characters), not names.

Still open:

- A failed payout returned to the balance (`payout_reversal`) is booked to Adjustments, not against Stripe clearing. That overstates clearing while the reconciliation still agrees.
- 5 of 7 seeded bugs passed every test.
- Nothing has been checked against a real Stripe export.

### research/cfar-family-twin (verification 2)

The reviewer is a radar detection theorist. The false-alarm side is right. The auditor rebuilt the CA thresholds (Finn and Johnson's closed form), the OS thresholds (independent order-statistic quadrature) and the K-distribution oracle, then ran a 2-million-window Monte Carlo of its own. Everything matched the paper to within 0.1%, for example CA inflation 30.13× against the paper's 30.11×. The full ten-minute run reproduced `results.txt` byte for byte.

**The worst defect (medium):** the Rayleigh target was added to the clutter in power (τe₀ + s·e₁) rather than in complex amplitude. For a single-pulse Swerling I target the square-law output is Exp(τ + s), so every detection-probability figure comes from a non-standard model. I checked one value by hand from the closed form: the twin CA Pd at ν = 2 and 15 dB is 0.686, against the paper's 0.700. The detector ranking looked unchanged in the checks run. Regenerating the Pd numbers needs the full rerun and a rewrite of sections 5 to 7, so **in this PR the error is disclosed** in the paper and README rather than fixed. The PR also adds the K-clutter CFAR literature the paper had not cited (Watts 1985, Armstrong and Griffiths 1991, Ward, Tough and Watts 2013) and a sentence on what is new and what follows from the model by construction.

### research/eda-gridorder (verification 1)

The reviewer is a design-of-experiments researcher. The numbers are right: an exact-fraction recomputation (its own Halton sequence, maximin order and hypervolume, computed two ways) reproduces every deterministic cell of `results.txt`. I re-ran that script and got the same rows (Halton 0.926 at budget 8, farthest-point 0.889 at budget 4).

**The worst defect (medium):** the headline "Halton reaches 90% of the front in 7 evaluations" was the best of 48 equally valid labellings of the same sequence. Across all 48, the budget-8 score has mean 0.854 and minimum 0.746, and 42 of 48 still beat random's 0.808. The README now says so. Two other fixes in this PR:

- The README now cites the textbook prior work: Latin hypercube, Halton, and maximin designs.
- Two new tests pin the independently recomputed values. They now catch three of the four seeded bugs that had survived: swapped Halton bases, the maximin update flipped to `max`, and a 50% bootstrap interval passed off as 95%.

## What changed since the last round

Round 58 also found 0 of 4 at the bar and also caught 8 of 23 seeded bugs, so the sampled share stays at 31 of 250 (9% to 17%). The gate that binds is the same as last round: all four subjects miss on verification. The two products each had a defect a single test, written from the domain standard, would have caught: a list of fish species, and a thousands separator in the deposit box.
