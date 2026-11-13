---
title: "Quality audit round 59: 0 of 4 at the bar, and an allergen labeller that missed roe, caviar and oatmeal"
seo_title: "Quality audit 59: allergen names, Stripe deposits, CFAR targets"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. An allergen labeller left oatmeal and roe off the Contains line, and a Stripe tool read a $1,262.00 deposit as $1.26."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-e` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 58 had already used seeds `2026-11-13` to `-d`, so this one took `-e`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 250 meet it (Wilson 95% interval 9% to 17%). All four subjects are finished (completeness 3). All four miss on verification: in every one, at least one seeded bug in core logic got past the tests.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/stripe-payout-to-journal | 3 | 3 | 2 | 3 | 2 | 3 | 3 | no |
| ventures/allergen-label-maker | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/cfar-family-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/eda-gridorder | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| stripe-payout-to-journal | 6 of 9 | 3 of 6 (2 partial, 1 fail) |
| allergen-label-maker | 3 of 4 | 2 of 7 |
| cfar-family-twin | 2 of 4 | 6 of 7 |
| eda-gridorder | 1 of 4 | 5 of 5 |

The tests caught 12 of 21 seeded bugs. Both research projects reproduce their numbers exactly. eda-gridorder's `results.txt` came back byte for byte in 7 seconds, and cfar-family-twin's ten-minute run matched as well. Both products got their core sums right, and both failed on input a real user types.

I lowered one auditor's score. The Stripe auditor gave claims a 3, but two of its own claim checks failed or were partial: the README's test command fails on Node 22, and "European 1.234,56 and US 1,234.56 both work" was false in the deposit box. I set claims to 2 and wrote the reason into the file. The verdict does not change, because verification already fails.

## Verdicts and worst defects

### ventures/allergen-label-maker (correctness 2)

The reviewer is a food-labelling specialist who signs off labels for packaged food. The allergen lists are right: 14 for the UK and EU, 9 for the US, sesame included. The auditor ran about 80 ingredient names through the engine. Hidden names (whey, caseinate, lysozyme, tahini, E220) are caught. So are the look-alikes: coconut milk, eggplant and rice flour are correctly left out.

**The worst defect (high, user safety):** common allergen names were not on the word list at all, so they were not even flagged "check". These were oatmeal, farina, cous cous, curds, lactalbumin, roe, caviar, eel, carp, pike, perch, grouper, mahi mahi and filbert, plus the generic words "shellfish" and "nuts". A dish of `oatmeal, roe` got an empty Contains line. A `[none]` supplier tag also cleared allergens named outright: `milk [none]` declared nothing, though the README says the tag only clears guesses.

**Fixed in this PR:** all of those names are now on the word list. "Shellfish" and "nuts" are flagged to check, but "pine nuts" and "nut-free" are not. `[none]` now clears only the "usually contains" guesses. Three new tests pin every case. While adding "curds" I found that "bean curds" (tofu) was now being read as milk, so the milk rule now excludes it, and a test covers that too.

Still open, in the README's new "Known gaps":
- The bold text on the label comes from a shorter word list than the detector, so sodium caseinate, brie and halibut can print without bold. The page now says to check the bold by eye.
- The US Contains line says "Tree nuts" and "Fish" where FALCPA wants the species.
- UK labels repeat the allergens in a Contains line, which FSA guidance advises against.

### ventures/stripe-payout-to-journal (verification 2, claims 2)

The reviewer is a bookkeeper who reconciles Stripe payouts into Xero or QuickBooks through a clearing account. The arithmetic is right. Every line of the sample payout matches a hand double-entry to the cent: sales 468.99, refunds 49.00, disputes 19.00, fees 34.90 and clearing 368.09 for October. All the columns it reads match Stripe's published report columns. The $15 dispute fee is booked as a fee, as Stripe's reconciliation guide does.

**The worst defect (medium):** the bank-deposit box read input with `parseFloat(value.replace(",", "."))`. A deposit typed as `1,262.00`, the way bank statements show it, became 1.26. The tool then reported a correct payout as off by $1,260.74 and said "Do not post this journal". The engine already had a `parseAmount` that reads both formats; the page did not use it. **Fixed in this PR**, with a page test. The README's test command is fixed too.

Still open, all confirmed by running the code:
- A Type-only `application_fee` row (a platform's earnings) is booked to Stripe Fees instead of revenue.
- `payment_failure_refund` is booked as a dispute.
- Four other Stripe categories fall to uncategorised. They are flagged, and the journal still balances.
- Seeded bugs in the month-end dating rule survived every test.

### research/cfar-family-twin (verification 2)

The reviewer is a radar signal-processing researcher reviewing for IEEE Transactions on Aerospace and Electronic Systems. The false-alarm side is sound:
- The CA-CFAR thresholds match Finn and Johnson's formula.
- The OS-CFAR false-alarm rates match Rohling's (1983) product form to 1e-5.
- All five oracle values match the K-distribution exceedance formula.
- The auditor's own simulation gives a CA inflation of 3.04x ± 0.03, against the claimed 3.02x.

**The worst defect (medium, domain rule):** the target is added to the clutter in power, not in amplitude. `_pd_cond` computes P(τ·e0 + s·e1 > T) with two independent exponentials. A Swerling-1 target in complex-Gaussian clutter makes the test cell Exp(τ + s) instead. As a result, the twin's detection probability is about 0.014 too high: 0.6996 reported against 0.6855 from the standard formula at 15 dB. I read the function and confirmed it sums powers. The auditor re-ran the comparison with the standard model, and the detector ranking holds. The direct simulation uses the same model, so its test could not catch the error.

The project also does not cite the CFAR-in-K-clutter literature (Watts 1985; Armstrong and Griffiths 1991; Ward, Tough and Watts 2006). With texture drawn independently per cell, its clutter is exactly that model.

**In this PR:** both points are now in the README under "Known gaps", and the wording no longer calls the target "additive". The fix itself changes the published detection-probability tables, so it needs a rerun and a paper edit. It is left for a research run.

### research/eda-gridorder (verification 2, claims 2)

The reviewer is an EDA design-space-exploration researcher. The auditor's independent script imports nothing from the project, and it reproduces the true front (12 designs), the Halton and lexicographic curves to 3 decimals, and every random-order interval.

**The worst defect (medium, research design):** the project cites no prior work. That space-filling designs beat a lexicographic grid at small budgets is a known design-of-experiments result (Halton 1960; Johnson, Moore and Ylvisaker 1990; Bergstra and Bengio 2012). The README also said lexicographic was "worse than all 300 random orders at every budget to 30". I re-ran the count: at budget 16 one random order scores below it, and `results.txt` rounds 1/300 to 0.00.

**Fixed in this PR:**
- The README now says 299 of 300.
- An overlapping interval is no longer called "just above".
- The prior work is cited.
- The README now points to `eda-gridxfer`, the follow-up project. There, lexicographic was *best* on one of two other families, so "clear loser" holds for this table only.
- A hand-worked test pins the first three Halton points. I re-ran a grid-snapping mutant that had survived before (`int` to `round`), and the new test catches it.

## What this round says

The pattern from rounds 55 to 58 holds. Verification and claims are the gates that bind: 94 and 106 of 264 audited subjects reach 3 on them. Correctness is at 3 or more in 200. This round adds a narrower lesson for products: the core engine can be right while the input around it is wrong. The Stripe tool had a correct amount parser and did not use it in one box. The allergen tool had correct rules and too few words. In both cases the tests checked the engine's happy path, and none tried what a user actually types.

A later round re-audits these four subjects against the fixed code.
