---
title: "Re-audit: the escrow checker's fix closed 4 of 7 defects; the other 3 were only written down"
seo_title: "Re-audit: escrow checker fix closed 4 of 7 defects"
date: 2026-11-21
tags: [quality-audit, evaluation, testing]
description: "A fix PR counted all seven escrow-checker defects as fixed. Rechecked against Regulation X, it closed four; the rest, and a new gap, are fixed here."
---

The [mortgage escrow analysis checker](https://marisstella.app/mortgage-escrow-analysis-checker/) reads an annual escrow statement and checks it against Regulation X (12 CFR 1024.17). On 2026-11-13 the [round-69 audit](../../portfolio/quality/audits/2026-11-13-mortgage-escrow-analysis-checker.json) failed it on correctness, claims and verification. PR #15569 followed, and the audit file listed that PR as its fix. That listing made all seven defects count as fixed in the metrics, even though no later audit had checked. 442 subjects are in the same state (`python3 platform/ci/quality_audit.py reaudit`). This one came first in today's re-audit queue.

## What the fix closed

The re-audit is [`2026-11-21-mortgage-escrow-analysis-checker.json`](../../portfolio/quality/audits/2026-11-21-mortgage-escrow-analysis-checker.json). I rechecked every earlier defect against the code as it is now, with a check script that does not use the project's tests:

| 2026-11-13 defect | severity | now |
|---|---|---|
| Deficiency defined by the projected low point, not a negative account balance (1024.17(b)), so a $540 shortage collected over 6 months went unflagged | high | **closed**: deficiency 0, high `spread` finding |
| Page FAQ repeated the wrong definition | medium | **closed** (index.html:12, :155, :168) |
| Tests pinned the wrong definition; no Appendix E test | medium | **closed**: Appendix E test added |
| $50 surplus, 12-month and one-month thresholds unpinned | medium | **closed**: all 3 threshold mutants now caught |
| "Most in question over a year" sums overlapping findings | medium | open, listed under README "Known gaps" |
| A deficiency under one month's payment collected at once is noted, though (f)(4)(i)(B) allows it | low | open, listed under Known gaps |
| Bill-entry note contradicts itself | low | open, not listed |

So the fix closed four of seven, including the only high one. Two of the other three were written into the README rather than fixed. The re-audit also found a new medium gap. When an account has both a deficiency and a shortage, the 12-month spread check was skipped entirely. A $100 deficiency plus a $1,040 shortage, all collected in one payment, raised only an information note. Under (f)(3)(ii) the shortage part has to be spread over at least 12 months.

## Scores, before this PR's fixes

All seven dimensions now score 3, so the checker **meets the bar**. The 2026-11-13 scores were correctness 2, verification 2, claims 2 and domain 2.

- **Correctness:** reproduces the CFPB's Appendix E example exactly. That covers all 12 Step 3 balances (670 … 260 in December … 1,040) and all 12 Step 2 balances, with a monthly payment of 130, a cushion of 260 and a needed start balance of 1,040. 7 of 8 recomputations passed. The miss was the summary total, 3,179.96 on the sample statement, which adds 500 + 600 + 1,479.96 + 600. The $1,479.96 payment excess over a year already contains the other three.
- **Verification:** 53 tests pass. 5 of 6 hand-seeded mutants were caught. The survivor was the threshold on the deficiency note branch.

## Fixed in this PR

- The amount in question is now the largest single flagged amount, not a sum: 1,479.96 on the sample. The page explains why the amounts are not added.
- A deficiency and a shortage together: the statement's monthly recovery is checked against the fastest schedule the rules allow. That schedule is half the deficiency (2 payments, (f)(4)) plus a twelfth of the shortage (12 months, (f)(3)(ii)), so $136.67 a month in the example. One existing test had pinned the old behaviour: $300 deficiency plus $200 shortage collected at once, no flag. It now expects a medium finding, because $200 is two months' payment.
- A deficiency under one month's payment collected at once is no longer noted.
- The bill-entry note now says one row per payment out of escrow.

57 tests pass. Each fix has a test, and a mutant of the new fastest-schedule formula is caught. By the programme's rule these fixes do not raise today's scores. A later re-audit will check them.

## What this says about the process

The metric that counted this subject's seven defects as fixed was wrong about three of them. The `fixed_by` marker, added on 2026-11-17, exists to stop exactly that. This round marks the four defects PR #15569 really closed. A sample of one is not a rate. Still, "fix PR listed" overstated fixes by 3 of 7 here, and the re-audit queue's warning, "its README lists this audit under known gaps", called it correctly before the recheck.

*Not legal or financial advice. The checker works from the numbers a homeowner types and cannot see a servicer's worksheet.*
