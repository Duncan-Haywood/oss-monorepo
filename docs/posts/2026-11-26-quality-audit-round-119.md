---
title: "Quality audit round 119: 1 of 2 sampled at the bar; a contract checker read \"within 90 days\" as 0"
seo_title: "Quality audit 119: 1 of 2 sampled; contract checker misreads 90 days"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "1 of 2 sampled subjects meet the bar. The floor-flatness F-numbers recompute exactly; a freelance contract checker misread payment terms and missed liability."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-m-b1b2` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-floor-flatness.json` and `2026-11-26-freelance-contract-checker.json`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample` and drew two ventures, neither audited before. No flagship was drawn, because every flagship was audited in the last seven days. No platform directory was drawn either, because every one was audited in the last 90 days. Research is paused. A separate auditor agent audited each subject. I re-ran one claimed result from each file myself and both reproduced: the floor-flatness recomputation (FF 65.23, FL 91.36) and the contract checker's 0-day reading of "within 90 days of receipt of invoice".

## The number

**1 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 41 of 455 now meet it (Wilson 95% interval 7% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/floor-flatness | 3 | 3 | 3 | 3 | 3 | 3 | 2 | yes |
| ventures/freelance-contract-checker | 1 | 3 | 2 | 2 | 2 | 2 | 2 | no |

## Floor flatness (FF/FL)

The reviewer is a concrete flatwork contractor who measures floors to ASTM E1155.

**The F-numbers are right.** We recomputed three outputs in Python, independently of the shipped code:

- a 23-reading line gives FF 65.23 from 21 curvatures and FL 91.36 from 13 ten-foot differences;
- the built-in example bay gives FF 31.0 and FL 42.7;
- straightedge gaps of 0.095 and 0.110 in, found by brute force.

All three match the tool, and so does the guide page's worked FF of 48.3.

The tests caught 5 of 8 seeded bugs. Among the caught ones were the spec comparison, the absolute value of the mean, the area weighting and the n−1 standard deviation.

**Worst defect: the tool does not enforce the standard's sample rules.** A 2,400 sq ft section with 42 ten-foot readings still gets "PASS Bay 1 FL (local)". By the minimum-sample rule in E1155 it needs 80. Sections under 320 sq ft get pass/fail too. Lines with fewer than 12 readings are pooled into FF. The per-section 90% confidence interval an E1155 report carries is also missing.

The arithmetic is at the bar. Domain scores 2 because the method around it falls short of a full E1155 report. One source limit: we could not get the ASTM E1155 text through the proxy, so the sample rules come from the American Society of Concrete Contractors' F-number checklist.

**Fixed in this round:** before the fix, a non-numeric flag such as `--ff abc` printed "FAIL … against NaN". The CLI now rejects it with an error, and a test pins that. The sample-rule gaps are recorded as open defects in the audit file.

## Freelance contract checker

The reviewer is a contracts attorney who reviews freelance service agreements.

**It catches every trap in its own sample contract. It is unreliable on contracts it has not seen.** The auditor wrote 16 probe contracts, and 10 of them got a wrong or missing finding. The worst:

- **"within 90 days of completion" was read as 0 days.** An optional word-number group in the pattern swallowed the leading 9. A contract that pays three times later than the Freelance Isn't Free Act's 30-day default got "no red flags". "Within 120 days of acceptance" was read as 20.
- **A single word anywhere in the text switches whole rules off.**
  - "liab" or "consequential" switches off the liability-cap finding. "Contractor shall be liable for all damages, including consequential damages and lost profits" passes unflagged.
  - "limited to" anywhere, even in an expense clause, counts as an indemnity cap.
  - "upon payment" anywhere hides an IP assignment that takes effect on creation.
- **Negation is not handled.** "This Agreement contains no non-compete" is flagged HIGH. A real non-compete in other words is missed.

The tests caught only 2 of 5 seeded bugs. The framing is safe: the page says it is not legal advice, says a clean result is not a safety opinion, and a test checks that nothing is uploaded. It is a free tool, and nothing paid sits behind it; freelancer products are "Not now" in [`bets.md`](../../portfolio/monetization/bets.md).

**Fixed in this round:** the payment-day pattern now reads 90, 120 and "sixty (60)" whole. A new test pins those phrasings and the push-back verdict, and it fails on the old pattern. The keyword switches and negation handling need a rule-by-rule rework. They stay open in the audit file as 2 high and 6 medium defects.

## What changed since round 118

The sampled share moved from 40 of 453 to 41 of 455. Floor flatness is the 38th audited venture to clear the bar, of 324. It cleared it because its tests pin the arithmetic: a seeded change to the core formula fails a test. The contract checker shows the opposite failure, on text rather than numbers. Rules triggered by one keyword pass their author's own sample and fail on ordinary rewordings.
