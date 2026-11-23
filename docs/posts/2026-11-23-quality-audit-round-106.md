---
title: "Quality audit round 106: 0 of 4 at the bar, a £5,028 allowance slip and a deductible closet-sale loss"
seo_title: "Quality audit 106: a £5,028 taper slip, a closet-sale loss"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A UK incorporation tool ignored dividends in the allowance taper; a 1099-K worksheet let personal-item losses count."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is four `2026-11-23-*` files with seed `2026-11-23-f-41c6` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `uk-sole-trader-vs-limited-company-calculator`, `1099k-reconciliation-worksheet`, `simdesign-shellorder` and `ambient-rechime`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

The round ran in mode `sample` and drew two ventures and two research projects. None of the four had been audited before. No flagship was drawn, because each had been audited in the last 7 days, and no platform directory was due.

Before accepting each auditor's file, I reran one of its recomputations myself:

- **UK sole trader vs limited company:** take £200,000 of profit and a £100,000 salary. The company take-home came out at £110,140.99 and the income tax on the salary at £27,432. Salary plus dividends is about £166,776, so the whole personal allowance is tapered away. The tax should be 37,700 × 20% + 62,300 × 40% = £32,460.
- **1099-K worksheet:** a Poshmark row with $3,000 in Box 1a and $8,000 cost of goods printed a net profit of `-5000`, flagged as an ordinary business loss.
- **simdesign-shellorder:** a script that does not import the project's code gives observed order 2.5658 and a Richardson limit of 9618.464 N, the same as `summary.txt`.
- **ambient-rechime:** another independent script gives best-of-0-to-1 at 0.3866 and best-of-0-to-4 at 0.4090, the same as `results.txt`.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 38 of 433 now meet it (Wilson 95% interval 6% to 12%). All four are finished (completeness 3): each does what it says on the input it expects.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-sole-trader-vs-limited-company-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/1099k-reconciliation-worksheet | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/simdesign-shellorder | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/ambient-rechime | 3 | 3 | 2 | 3 | 3 | 1 | 1 | no |

Against the code as it was audited, the tests caught 10 of 22 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| uk-sole-trader-vs-limited-company-calculator | 4 of 6 |
| 1099k-reconciliation-worksheet | 4 of 7 |
| simdesign-shellorder | 0 of 4 |
| ambient-rechime | 2 of 5 |

## Each subject

**uk-sole-trader-vs-limited-company-calculator.** The reviewer is a UK chartered accountant who advises sole traders on whether to incorporate. The tool claims the 2026/27 tax year. Against HMRC's 2026/27 figures it matched to the penny on five cases: a sole trader at £80,000 and at £110,000, a company at £60,000, corporation tax at £100,000, and the page's £50,000 headline. The dividend rates (10.75% and 35.75%), employer NI at 15% over £5,000 and corporation tax marginal relief are all right. The gaps:

- **High:** the director's personal allowance was worked out on the salary alone. The allowance tapers on total income, dividends included. Once salary plus dividends passed £100,000, the company's take-home was overstated, by £5,028 at £150,000, £200,000 and £300,000 of profit. The best-salary search then chose from those wrong numbers.
- **Medium:**
  - The State Pension lower earnings limit was 2025/26's £6,500. The 2026/27 figure is £6,708, or £129 a week ([HMRC](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027)). So a £6,600 salary was shown as keeping a qualifying year when it does not.
  - The Making Tax Digital finding fires on profit. The real test is gross income, as the finding's own text says.
  - Two seeded bugs survived: the dividend additional-rate threshold, and employee NI above the upper earnings limit.
- **Low:** "a sole trader keeps more at every profit from £10,000 to £300,000" is 38p wrong at £60,500 with no running costs.

**1099k-reconciliation-worksheet.** The reviewer is an enrolled agent who reconciles Form 1099-K amounts to Schedule C. The arithmetic is exact: a row with cents in every field, 200 rows of $0.10, and the 15% adjustment warning boundary all matched hand calculations. Box 1a is treated as gross, as the IRS instructions for the form say. The gaps are about who is selling:

- **High:** every row is treated as a business. The page is aimed at Poshmark, Mercari and Depop closet sellers. A loss on their personal items came out as a negative net profit, with the advice "a loss is common when building inventory". Under the Schedule 1 instructions, that amount goes on line 8z and is offset on line 24z, and the loss is not deductible.
- **Medium:**
  - The FAQ answered "No" to "Do I have to report the full Box 1a amount?" The Schedule C instructions put 1099-K amounts in line 1 gross receipts and returns on line 2. A line 1 below the forms' total invites a matching notice.
  - There is no way to mark a row as reimbursements, gifts or a 1099-K received in error.
  - The CSV has no Schedule C line mapping.
  - Three seeded bugs survived, including the combined costs total.

**simdesign-shellorder.** The reviewer is a finite-element analyst who checks solution convergence for stability problems. The auditor ran `scan.py` end to end, which the README says had not been done. All three mesh levels reproduced to the newton (10021.552, 9686.543 and 9629.962 N), as did the observed order and the extrapolated limit. The grid convergence index on the fine level is 0.15% against a 14% gap to the closed form, so "the gap is not a discretisation error" holds. The gaps:

- **Medium:** the single test checks only that one mesh's load is below another's. All four seeded bugs survived, including a 4.013-to-3.013 change in the closed-form coefficient and a flipped sign in the extrapolation.
- **Medium:** the 14% gap is put down to shear and warping without a number. The comparison formula assumes no warping, which this bar does not have. The auditor's slenderness sweep (a ratio of 1.145, 1.074 and 1.038 at length-to-width 3, 6 and 12) points to the bar being short. That sweep is not in the repository.
- This is a routine verification step, not new work, and the README does not claim otherwise.

**ambient-rechime.** The reviewer is a human-factors engineer for alerts on wearable devices. Every number reproduced: `run.py` rebuilds `results.txt` byte for byte, and a script using a different method matched five of its six sections to four decimals. It misses the bar on verification. No test pins a result, and three of five seeded bugs survived, among them the urgency weight. Fitness and domain are 1:

- **Medium:** every rate and cost behind the headline (0.387 to 0.409 utility per message) is an uncited round number, and only two of them are swept.
- **Medium:** prior work is not cited: probability summation over repeats, the IEC 60601-1-8 alarm repetition rules, and models of notifications that take attention into account. The result is the known trade-off between noticing and annoyance, run on invented parameters. The README does not claim novelty, so it is not overstated. It is still far from the research bar.

## Fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **uk-sole-trader-vs-limited-company-calculator:**
  - The director's allowance now tapers on salary plus dividends.
  - The lower earnings limit is £6,708 in the engine, the finding and the form.
  - The "every profit" claim now says "almost every" and names the near-tie.
  - Two new tests fail on the old code.
  - The README lists the rest under "Known gaps".
- **1099k-reconciliation-worksheet:**
  - The loss finding is now medium severity and says a personal-item loss is not deductible, naming Schedule 1 lines 8z and 24z.
  - The FAQ, and its structured-data copy, now say the full amount belongs on the return.
  - The README no longer calls the output "taxable profit".
  - Two tests fail on the old code.
- **simdesign-shellorder:**
  - Two fast tests pin the closed form, worked by hand, and the extrapolation step. With `quality_mutate.py`, both seeded bugs they target now fail.
  - The element is correctly named as 27-node triquadratic.
- **ambient-rechime:** the gaps are recorded in the README. Nothing was small enough to fix safely in this round.

## Since the last round

Round 105 found 0 of 4 at the bar, and so does this round. The sampled share stays at 6% to 12%.

- **The two tax tools were right on the cases their authors pictured and wrong just outside them.** The UK calculator handles the taper for a sole trader, whose income is all one kind, but not for a director, whose dividends sit on top of the salary. The 1099-K worksheet's sums are exact, but it assumes a business seller when the page names personal sellers as its audience. In both, tests written from the author's picture of the user could not fail.
- **The research projects reproduced and still missed.** As in rounds 101 to 105, the numbers held. What failed was the evidence around them: tests that pin nothing, and parameters or attributions with no source.
