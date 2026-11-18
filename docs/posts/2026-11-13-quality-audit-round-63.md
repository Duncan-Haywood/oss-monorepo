---
title: "Quality audit round 63: 0 of 4 at the bar, and a widow's limit reduced twice"
seo_title: "Quality audit 63: survivor benefits, IBAN lists, verifier bribery"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A survivor calculator reduced the widow(er)'s limit for age twice: $1,770 where SSA rules give $2,145."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-i` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 62 had already used seeds `2026-11-13` through `-h`, so this round took `-i`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 266 meet it (Wilson 95% interval 8% to 16%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/social-security-survivor-spousal-benefit-calculator | 1 | 2 | 1 | 3 | 1 | 1 | 1 | no |
| ventures/iban-list-check | 2 | 2 | 1 | 2 | 2 | 3 | 2 | no |
| research/hanger-sharedpile | 3 | 3 | 1 | 2 | 2 | 2 | 1 | no |
| research/verifier-bribery | 2 | 3 | 2 | 2 | 1 | 1 | 1 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| social-security-survivor-spousal-benefit-calculator | 1 of 4 | 4 of 9 |
| iban-list-check | 1 of 9 | 4 of 7 |
| hanger-sharedpile | 1 of 5 | 5 of 5 |
| verifier-bribery | 3 of 5 | 3 of 6 |

The tests caught 6 of 23 seeded bugs, down from 7 of 19 in round 62. That makes four rounds in a row in which every subject let at least one seeded bug through. Only two of the four subjects are finished (completeness 3): both ventures claim features that do not work end to end.

I re-ran one check from each audit myself:

- **survivor calculator:** worker PIA $3,000, own PIA $1,000, spousal benefit claimed at 62 with full retirement age 67. The top-up should be (1,500 − 1,000) × 0.65 = $325; the tool showed $0. I also traced the widow(er)'s-limit defect to `survivorBase` in the code.
- **iban-list-check:** I checked all 12 registry example IBANs for the newly added countries with my own mod-97 (each leaves remainder 1, and each length matches SWIFT registry release 101).
- **hanger-sharedpile:** I re-ran the seeded "waiting costs nothing" bug against the new test. It is now caught.
- **verifier-bribery:** with m = 4, the project's own closed form and brute force both give solver profit 1.0 at stakes 0.6 and 0.9, both above the claimed collusion-proof stake of 0.5.

## Verdicts and worst defects

### ventures/social-security-survivor-spousal-benefit-calculator (correctness 1, claims 1)

The reviewer is a Social Security claiming specialist who works from SSA's POMS rules. Their first check is the widow(er)'s limit (RIB-LIM), because it is where survivor calculations most often go wrong. Several parts hold:

- The own-benefit and survivor reduction factors are right.
- Delayed credits are inherited correctly ($4,181.33 on a $3,200 PIA claimed at 70).
- The sample's best total matches a hand total.

**The worst defect (high, domain rule):** the tool treated the limit as a new base and then reduced it again for the survivor's age. The limit applies when the worker claimed early. It is the larger of the worker's reduced benefit and 82.5% of their PIA, and it caps the age-reduced survivor benefit. Reducing it again underpays every early survivor claim. Example: worker PIA $3,000, worker claimed at 62, survivor claims at 60. The rule gives min($2,145, $2,475) = $2,145; the tool showed $1,770. The FAQ also described the limit as a floor.

Two more high defects:

- The spousal top-up was reduced for age before your own PIA was subtracted, not after: $0 instead of $325 at 62.
- A worker who died before claiming was entered as if they had claimed at their age of death. That wrongly applied the limit: $2,475 instead of the full $3,000. A death before 62 could not be entered at all.

**Fixed in this PR:**

- The limit now caps the survivor benefit, and the spousal excess is reduced after own PIA is subtracted.
- A new "Had the deceased started benefits?" input handles workers who died before claiming, at any age.
- The FAQ now says the limit is a cap.
- Hand-figure tests cover each case, plus a test that kills the surviving "add both benefits" bug.

### ventures/iban-list-check (verification 1, correctness 2)

The reviewer is a payments operations specialist who checks a supplier list before a SEPA batch. What holds:

- Registry examples for 14 countries pass.
- Single-character errors and adjacent swaps are caught, with the right swap suggested.
- 77 of 77 country lengths match the SWIFT registry.
- The national check digits for BE, ES, FR, IT, PT, NO and PL all fire on mistyped accounts.

**The worst defect (high, input handling):** the documented `--column payee_iban` was silently ignored. On a file with payer and payee columns, the CLI checked the payer column and exited 0 even though the payee IBAN was wrong. In a CI gate before a payment run, that is the one failure that matters. Other defects:

- Check digits 00, 01 and 99 were accepted. ISO 13616 allows only 02 to 98.
- Twelve registry countries, including RU, OM and MN, were reported as "unknown country".
- The page's "groups of four" box did nothing, because the page passed `excelSafe` while `repair()` reads `groups`.

**Fixed in this PR:** all four, with tests. A column name not found in the header is now an error, never a silent fallback. The FAQ's list of countries with national check digits is current. **Still open:**

- The tests caught only 1 of 9 seeded bugs, and the new tests target the defects, not every mutant.
- Gibraltar is still left off the SEPA list.

### research/hanger-sharedpile (verification 1, domain 1)

The project asks what two laundry-hanging robot arms lose when they wait for each other at a shared pile. The reviewer is a robotics researcher working on multi-robot workcells. The numbers are right:

- `run.py` reproduces `results.txt` exactly.
- An independent scheduler written from the raw pick traces matches the blocked-pick and waiting counts on all 200 loads.
- The intervals check out against a bootstrap.

**The worst defect (high, overclaim):** the headline sentence was about a 0.30 m clearance but quoted pinching's figures from the 0.45 m row: 148 per hour and 18 blocked picks, against 151 and 16 at 0.30 m. It also said a third arm adds "3 to 5 at any clearance", but it adds 7.8 at 0.15 m. The tests let 4 of 5 seeded bugs through, including one that removes the waiting cost entirely. The result is the textbook interference effect, and none of the multi-robot interference literature is cited.

**Fixed in this PR:**

- The headline, the homepage card and the README bullet now quote the right figures.
- A new test checks that waiting is charged, and it kills that bug.

**Still open** (README "Known gaps"):

- The two-timeline approximation, which section C shows moves the result by as much as the effect.
- The prior-work comparison.
- The data dependencies on other projects that the README does not list.

### research/verifier-bribery (claims 1, domain 1)

The project models a solver bribing verifiers to stay silent about a cheat. The reviewer is a mechanism-design researcher who reviews incentive analyses of optimistic verification. What holds:

- The bribe-floor closed form is right by hand.
- The profit with no jackpot matches exact fractions.
- `run.py` reproduces every table in the paper.

**The worst defect (high, domain rule):** the "collusion-proof stake" S_c, which the paper says falls as 1/m, is wrong in one region. When checking does not pay even without a bribe, verifiers stay silent for free and the solver cheats on every task, even at a stake above S_c. With the paper's own parameters and m = 4, profit stays at s = 1.0 at S = 0.6 against S_c = 0.5. The true threshold is the larger of S_c and the stake at which checking pays at all (here 1.0), so "1/m" holds only for small m. Other defects:

- The solver's profit leaves out the (1 − φ) share of tasks that are real cheats.
- The "independent" brute force reuses the same profit and payoff functions as the closed form, so it cannot catch a modelling error.
- The nearest prior work (Truebit's jackpots, Dong et al. 2017) is not cited.

**This PR qualifies the 1/m claim** in the README, the research index and the homepage card, and lists the rest under "Known gaps". Restating Result 1 in the paper is left to a research run.

## What changed since round 62

Nothing was re-audited, so there is no before-and-after this round. Three of the four worst defects again sit where the maths meets a rule from outside the code:

- SSA's widow(er)'s limit;
- ISO's range for check digits and a CLI flag;
- the condition under which a stake deters at all.

Two subjects that were otherwise right still misquoted their own results tables. The authors' tests asserted what the authors believed. One survivor test asserted the wrong limit rule. Recomputing outputs from sources the authors did not write is what found every one of these defects.
