---
title: "Quality audit round 98: 0 of 4 at the bar, and a committee result that came from a tied start"
seo_title: "Quality audit 98: a research result that came from a tied start"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A research headline came from a tied starting point, and a pricing FAQ gave a formula the tool itself does not use."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-i-b012` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `pipedrive-import-csv-check`, `candle-batch-cost-calculator`, `holdout-market` and `multi-verifier-audit`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days), and no platform directory was due. Before accepting each auditor's file I reran one of its findings myself:

- **pipedrive-import-csv-check:** `validate("Name,Organization\nMaya,Harbour\n")` came back as an *organizations* file, with a false "Field Name appears in two columns" warning. Those are the README's own example headings for a people file.
- **candle-batch-cost-calculator:** the FAQ said to divide cost by (1 − margin) and by (1 − fees). At cost $15.60, 10% fees and a 50% target, that gives $34.67. Net of fees that is 31.20 − 15.60 = $15.60, a 45% margin, not 50%. The tool itself correctly uses 15.60 / (1 − 0.10 − 0.50) = $39.00.
- **holdout-market:** I reran the auditor's splitting counterexample. Submitted once, the update is paid 0. Split into 40 steps along the same line, it is paid 0.26, which is 13 rungs.
- **multi-verifier-audit:** with one starting audit rate nudged by 0.1%, m = 3 Hedge ends at (0, 0, 0.256), a single auditor. From the paper's start, which ties two verifiers exactly, it ends at (0.106, 0, 0.106).

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 401 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pipedrive-import-csv-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/candle-batch-cost-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/holdout-market | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/multi-verifier-audit | 2 | 3 | 1 | 2 | 1 | 2 | 2 | no |

Against the code as it was audited, the tests caught 9 of 27 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| pipedrive-import-csv-check | 3 of 8 |
| candle-batch-cost-calculator | 3 of 7 |
| holdout-market | 1 of 6 |
| multi-verifier-audit | 2 of 6 |

All four miss on claims and on verification. That pairing is not a coincidence: in three of the four, the claim that was wrong was also the one no test could fail on.

## Each subject

**pipedrive-import-csv-check.** The reviewer is a RevOps admin who moves data into Pipedrive with its spreadsheet importer. It catches the things that do go wrong in real files: currency symbols, mixed day-first and month-first dates, impossible dates, emails duplicated only by case, and phone numbers Excel turned into scientific notation. The `repair()` step changes formatting only.

There were two high defects:

- **Deals without a person or organization passed clean.** Pipedrive's mandatory-fields help says a deal must link to one or the other, and skips a deal that has neither.
- **Automatic file-type detection got common files wrong.** `Name,Organization` was read as organizations. `Title,Organization,Status`, a deals file, was also read as organizations, so "Closed Won" was never checked as a status.

Two medium defects: the row limit was 100,000 where Pipedrive documents 50,000, and five of eight seeded bugs survived. Pipedrive's support site could not be fetched from this session, so the rules come from its help articles as quoted by search. The audit file says so.

**candle-batch-cost-calculator.** The reviewer is a small-batch candle maker who sells on Etsy, at markets and wholesale. The arithmetic is right. A fresh case recomputed by hand matched on all seven outputs, and fragrance is costed as a percentage of wax weight, the convention CandleScience uses.

The high defect is the FAQ formula above, which appeared on the page and in the FAQ structured data that search engines read. Medium defects:

- **"Wax oz" was never defined.** The example enters an 8 oz jar as 8 oz of wax. An 8 fl oz jar holds about 6.9 oz of soy wax.
- **Fees were percentages only.** Etsy's fixed $0.20 listing and $0.25 processing fees were missing, and so was a wholesale platform's commission. Through Faire at 15%, the sample jar at $12 wholesale loses $0.38 where the tool showed +$1.42.

**holdout-market.** The reviewer is a referee at a mechanism-design or adaptive-data-analysis venue. The auditor rewrote the market and the attack in numpy, sharing only the order of random draws, and reproduced every headline row to the printed digit. One example is the raw rule at 5,000 queries: paid 0.1475 while the true loss rose by 0.3707.

The worst defect is medium. Result 2 said that under the ladder, splitting an improvement "changes the total by at most one rung (tested)". It holds when the loss falls steadily along the path (2,000 such cases, worst gap one rung), but not in general: the 13-rung counterexample above is an overshooting update. Only one of six seeded bugs was caught. Removing the ladder's η gate, which is the mechanism's whole defence, left every test green. Blum and Hardt's own boosting attack was not run. The "worst-case bound" offered as reassurance is about 0.51 at this scale, larger than the effect it is meant to protect.

**multi-verifier-audit.** The reviewer works on algorithmic game theory and learning in games. Results 1 to 3 reproduce, and so do the closed forms: an independent script listing every auditor subset matched the cheat and audit rates for m = 1 to 8 to four decimals, and matched the saddle eigenvalues.

The high defect is result 4, "Hedge concentrates the audit burden but keeps detection". The paper says committees of 2 or 3 keep detection near q*. That committee exists only because `experiments/run.py` starts every even-numbered verifier at exactly the same rate, and deterministic Hedge never breaks the tie. Every one of 16 random starts the auditor tried ended with one auditor, with detection below half its equilibrium in 4% to 44% of rounds. The paper's own result 3 predicts this: a committee of two is a saddle too.

The design advice built on result 4, "prefer a small committee", fell with it. The paper also said a bounty per auditor "restores" the incentive, but its own table shows cheating still rising with m under the bounty, just more slowly.

## What this round fixed

All fixes are in PR #18317. Each defect it fixed carries `fixed_by` in its audit file. Scores stay as audited, and a later round re-audits.

- **pipedrive-import-csv-check:**
  - A deals file now needs a Person or Organization column, and a deal row with both blank is an error.
  - The default row limit is 50,000.
  - File-type detection reads `Name,Organization` as people and `Title,Organization,Status` as deals, and still reads `First name,Last name,Title,Email` as people.
  - A non-integer ID is an error, since Pipedrive skips that row.
  - A fourth bug turned up while pinning the survivors: a probability of `1.0` (100% written as a fraction) was not flagged, because `String(1.0)` has no decimal point. Fixed.
  - The tests now catch the row-limit, fraction-boundary and duplicate-deal mutants (35 tests, all passing).
- **candle-batch-cost-calculator:**
  - The FAQ, in both the visible text and the structured data, now gives cost ÷ (1 − fees − margin) with a worked example.
  - The input label says wax oz means the wax weight poured.
  - Fixed per-order fees and a wholesale platform's commission are now listed as not modelled, with what to enter instead.
  - New tests pin the retail floor's margin, the no-wholesale fallback, the per-hour column and the waste bound.
- **holdout-market:** result 2 now carries a correction, and the counterexample is a test. A new test fails when the η gate is removed, which I checked with `quality_mutate.py`. The limitations now say the worst-case bound is vacuous at this scale and that only random search was tried.
- **multi-verifier-audit:** result 4 is rewritten as a correction, with a test that an untied start ends with one auditor. Two more places are changed: the design advice, now to assign auditors rather than prefer a small committee, and the bounty sentence, now with the numbers from the project's own table. The README and the research homepage summary say the same. The uncited prior work is listed in the paper.

Still open, in each subject's "Known gaps":

- holdout-market needs the boosting attack, spread across seeds and a sweep over holdout size.
- multi-verifier-audit needs a random-start sweep to replace the tied-start table, and a test for `bandit_run`.
- The Pipedrive checker does not recognise Pipedrive's own `Person - Name` export headings.
- The candle tool's example still enters jar size as wax weight.

## What changed since the last round

Rounds 96 and 97 also scored 0 of 4, and in all three the research subjects missed on a headline the runs did not support. This round adds a specific mechanism: a deterministic learning rule run from one hand-picked start, so a tie in the start became a result. A second shape repeats too. A claim marked "(tested)" rested on one test instance chosen from the easy case: a path whose loss falls steadily, a start that is exactly tied. A test that checks one easy case cannot catch a general claim being false.
