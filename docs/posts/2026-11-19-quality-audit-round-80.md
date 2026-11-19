---
title: "Quality audit round 80: 0 of 5 at the bar, and a chargeback ratio that hides Mastercard"
seo_title: "Quality audit 80: blended chargeback ratios, date-only bid deadlines"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. A chargeback monitor blends card brands, a bid tracker ignores the due hour, and the bookkeeper's $400 SE test finally exists."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-g-0f50` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/ai-bookkeeper`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **ai-bookkeeper:** Schedule SE on a $200,000 profit for 2026. The tool gives net earnings of 184,700.00, social security 22,878.00, Medicare 5,356.30 and a deduction of 14,117.15. By hand: 200,000 × 0.9235, the 184,500 wage base × 12.4%, 184,700 × 2.9%, then half the total.
- **chargeback-ratio-monitor:** in the bundled sample, Mastercard's June disputes are 9 on 373 charges, 2.413%. The tool's month table shows only the blended figure, 1.09%.
- **contractor-bid-readiness:** a bid due 2027-03-14, checked on 2026-11-19 in Chicago, has 115 days to go. By hand: 11 + 31 + 31 + 28 + 14.
- **delayed-outer:** the stationary variance at c = 0.2, τ = 4 comes out at 7.226 from a separate discrete Lyapunov solve, matching the repository's Yule–Walker code. The auditor's counterexample to the headline delay rule also reproduced (below).
- **qual-dialect:** the README's headline sensitivity ranges against `results.txt`. For Hausa, Igbo and Yoruba the file gives 0.4–2.2% for the word list and 1.9–10.8% for the English classifier. The README said 0.4–2.4% and 0.4–10.8%.

## The number

**0 of 5 subjects meet the bar** (0 of 4 sampled, plus the flagship). Across every sampled audit, 33 of 335 now meet it (Wilson 95% interval 7% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/ai-bookkeeper (flagship) | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| ventures/chargeback-ratio-monitor | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/contractor-bid-readiness | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/delayed-outer | 3 | 3 | 2 | 3 | 1 | 1 | 2 | no |
| research/qual-dialect | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Claims bound every subject: none scored 3. Verification bound all four sampled subjects. Of 25 bugs seeded by hand, the tests caught 14. The flagship is one point short: claims 2 is its only gate below 3.

## Each subject

**ai-bookkeeper (flagship).** The reviewer is a CPA who closes the books for sole proprietors. 130 commits have landed since the last audit on 2026-11-09. The suite has grown from 2,405 to 2,857 tests, all passing. On new inputs the numbers held: Schedule SE, the 2025 and 2026 bracket tables, Pub 946 depreciation tables, the EIC table method, Form 8959 and section 199A all matched. The exception was one Form 8959 figure, a cent low (277.87 against 277.88) because 0.009 × 3,087,500 is 27,787.4999… in floating point. A three-account month tied to its 1,596.56 closing balance. Two old defects are closed: the 5-day transfer window is now tested, and the retired host is gone. The worst defect is on the page. The "Not modelled" paragraph listed accruals, depreciation, inventory, splitting a line and locking a period, all things the same page has sections for. The README's learning-curve table still reports 133/133 for month 01, where the benchmark now prints 167/177. And for the third round running, moving the $400 Schedule SE threshold from `<` to `<=` left every test green.

**chargeback-ratio-monitor.** The reviewer is a payments risk manager who watches Visa VAMP and Mastercard's Excessive Chargeback Program. The sums are right: a separate Python reader matched every month of the worked example. The model departs from both programmes:

- The headline ratio blends every card brand, but each network measures its own. In the sample, June reads 1.09% "elevated" while Mastercard alone is 2.41%, past the tool's own excessive line.
- Mastercard divides by the *previous* month's transactions. With 10,000 charges in January and 5,000 in February with 120 chargebacks, Mastercard's rate is 1.20%. The tool shows 2.40% "excessive".
- Early fraud warnings are read and then left out, though VAMP counts them.
- There is no minimum-count gate: 16 disputes on 1,000 charges gets a high-severity finding.

Every merchant under the watch line saw an off-by-one. At 1,000 charges it said 7 more disputes "would reach" 0.75%, but 7 is 0.70%. It takes 8. The Mastercard rulebook PDF returned 403 through the proxy, so the ECM figures come from Stripe's documentation. 3 of 8 seeded bugs survived.

**contractor-bid-readiness.** The reviewer is a bid manager at a general contractor. The day count is right: against an oracle built from date strings alone it agreed on all 69,174 cases in each of nine time zones, including zones whose clocks change at midnight. The JobTread comparison is fair. It names no price and says plainly it is not affiliated. The worst defect is the model. A deadline is a date with no hour and no time zone. So a bid due at 2:00 pm still reads "urgent" at 3:00 pm, after it can no longer be filed, and the days page claimed that could never happen. When every item was ready, the summary dropped the deadline sentence, so a bid nine days past due read only "Ready". The urgency the model computes is never shown, though four pages promise it. `2099-02-30` counted as March 2. The DST test only tests anything when the runner's zone observes DST. 2 of 4 distinct seeded bugs survived.

**delayed-outer.** The reviewer is an optimisation researcher who works on delayed-gradient SGD and overlapped DiLoCo. Everything reproduced: the tests, and `experiments/run.py`, byte for byte against `results.txt`. Separate checks also agreed: a companion-matrix root solve, a Lyapunov solve, a Monte Carlo and the Levin–May closed form. The headline did not hold up. The README said the wall-clock-optimal delay is "exactly ⌈latency / compute time⌉". That was observed at one target noise floor. With the repository's own functions at a looser target (set by α = 2, L/T_c = 7) the best delay is τ = 2, and τ = 7 is 3.2× slower. At α = 3 no overlap is best. The stability limit and the fastest-rate root were presented as the paper's exact results. Both are classical for this recursion (Levin and May 1976), and none of the delayed-SGD or DiLoCo literature was cited. Workers restart from the stale model, where Streaming DiLoCo keeps each worker's own trajectory. Squaring the spectral radius in `rounds_to_shrink`, which halves every round count behind the 1.9×–7.5× speed-ups, left all 11 tests green.

**qual-dialect.** The reviewer is a computational social scientist who works on measurement error in automated annotation. The pipeline reran from fresh downloads in about 6 s with no diff against the committed results. The PPI formula matches Angelopoulos et al. (2023), and the observed width ratio (1.295) is close to theory (1.304). Two of the README's headline ranges did not match the results file. The bigger issue is design. "PPI never narrower, does not pay" was tested with plain PPI only. Power-tuned PPI++ or DSL is by construction no wider than hand-coding in large samples, and neither was run or cited. There is no competent multilingual baseline, so an English word list failing on Hausa is close to a foregone conclusion. 1,080 evaluation tweets also appear word for word in the in-language coder's training slice. 3 of 4 seeded bugs survived.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **ai-bookkeeper:**
  - A test pins the $400 Schedule SE threshold, so the mutant that survived three rounds now fails.
  - Form 8959 is computed as `× 9 / 1000`, with a test for the half-cent case.
  - The "Not modelled" paragraph now says what the page actually leaves out.
- **chargeback-ratio-monitor:**
  - The watch-line finding names the count that reaches the line, with a test.
  - The README describes the trend as end points, not a fitted line.
  - A "Known gaps" section lists per-brand ratios, the previous-month denominator, early fraud warnings and minimum counts. These are open.
- **contractor-bid-readiness:**
  - Calendar-invalid dates are no deadline.
  - The ready summary and the Markdown report carry the deadline and urgency.
  - The days page now says it does not know the hour a bid is due.
  - New tests cover each of these. The due-time field itself is a known gap.
- **delayed-outer:**
  - The README and paper state the delay rule as conditional on the target floor.
  - A prior-work section cites Levin and May, Kuruklis, delayed SGD and DiLoCo.
  - The stale-restart model is a stated limitation.
  - Tests pin `rounds_to_shrink` and both the rule and its counterexample. The mutant that survived now fails.
- **qual-dialect:**
  - The README ranges match the results, and a test parses `results.txt` so they cannot drift again.
  - Finding 4 now says it holds for plain PPI only.

## Since the last round

Round 79 also ended at 0 of 5, with verification and claims binding. The sampled share moved from 33 of 331 to 33 of 335. The flagship's re-audit is the one place to see change over time. Its open defect list shrank from six to five, and the oldest of them got a test today. Claims stayed at 2 because the page and README drifted behind the work that 130 commits added. That is the same "stale-docs" pattern as round 79's schedule-check FAQ.
