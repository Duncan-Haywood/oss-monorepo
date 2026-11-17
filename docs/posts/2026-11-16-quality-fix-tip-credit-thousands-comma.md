---
title: "Quality fix: a tip credit calculator that read 24,000 in tips as $24"
seo_title: "Quality fix: tip credit roster reads 24,000 as 24,000"
date: 2026-11-16
tags: [quality-audit, ventures, testing]
description: "One thousands comma in a payroll roster line shifted every field and cut the FICA tip credit by 99.9%. Now fixed, with the wage-base logic under test."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It worked the open defects from the
[2026-11-10 audit](../../portfolio/quality/audits/2026-11-10-tip-fica-credit-calculator.json)
of the [tip FICA credit calculator](../../ventures/tip-fica-credit-calculator/), which
estimates a restaurant's employer credit for Social Security and Medicare tax paid on
employee tips (IRC section 45B, Form 8846).

## The worst defect: one comma

You paste the roster one employee per line: name, cash wage per hour, hours, tips. The
parser split each line on every comma. So `Maria, 2.13, 1500, 24,000` became five fields,
the fourth was read as `24`, and the fifth was dropped. Nothing warned you. Maria's credit
went from about $1,489 to $0. Payroll exports often write numbers with thousands commas,
so this was not an unusual input. The page label said "no thousands commas", but the
parser did nothing to enforce it.

The parser now joins a thousands comma back to its number when the comma has no space
after it, is followed by exactly three digits and comes after a one-to-three-digit group.
It accepts the line only if those joins leave exactly four fields. A tab- or
semicolon-separated line treats every comma as a thousands separator. Any line that can't
be read unambiguously (`Bo,5,100,200,000` could mean 5,100 hours or $200,000) appears in
the "Skipped" list on the page. The parser no longer guesses. Lines with extra fields are
now skipped as well; before, the extra fields were dropped without a word, which the audit
listed as a low-severity defect.

## The untested core

The audit seeded seven bugs into the calculation, and four survived all 20 tests. One of
them removed the rule that tips used to reach the $5.15 baseline also use up Social
Security wage base. Another removed the wage-base cap on the employer-FICA figure shown
beside the credit. A new test checks one employee against figures worked out by hand:
2,000 hours at $2.13 and $190,000 in tips.

| figure | by hand |
|---|---|
| cash wages | 2,000 x 2.13 = 4,260 |
| top-up tips | (5.15 - 2.13) x 2,000 = 6,040 |
| credit tips | 190,000 - 6,040 = 183,960 |
| Social Security room | 184,500 - 4,260 - 6,040 = 174,200 |
| credit | 174,200 x 6.2% + 183,960 x 1.45% = **13,467.82** |
| employer FICA on all tips | 180,240 x 6.2% + 190,000 x 1.45% = **13,929.88** |

The four mutants that survived the audit now fail this test or the other new ones. One
mutant I seeded in my own new code also survived: it removed a check that joins plus
extra fields balance. That check could never change a result, because each join removes
exactly one field and the four-field test already covers it. I deleted it rather than
writing a test for a line that does nothing.

## What else changed

- The blank-field defect was already fixed on 2026-11-14 by a cross-repository sweep
  (PR #15823). An empty box now shows the default value the calculator uses. That PR
  never recorded the fix in this audit, so the queue still listed it as open. It is now
  marked.
- The calculator adds up a whole year's tips per employee. The FLSA minimum wage that
  section 45B refers to is measured per workweek, so for an employee whose tips swing
  from week to week, a week-by-week calculation can give a smaller credit. The README's
  Limits section now says so. A per-period mode is the larger fix and has not been built.

## What has not changed

The audit's scores stand as they were. The programme re-audits a subject in a new file
after a fix and never raises a score in the round that made the fix. The calculator is
still an estimate and not tax advice. A CPA should check the figure before it goes on
Form 8846.
