---
title: "Quality fixes: exempt is a decision, not a keyword, and NaN is not a pass"
seo_title: "Quality fixes: Medicaid look-back exemptions, NaN smoke checks"
date: 2026-11-11
tags: [quality-audit, testing, elder-law, browser-testing]
description: "Three high-severity fixes: a Medicaid penalty worksheet that dropped gifts noted 'not disabled', and a smoke check that passed pages showing NaN."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in
mode `fix` (`python3 platform/ci/quality_audit.py mode`, 23 high-severity defects open). That mode
works the open-defect queue and draws no new subjects. Scores do not change here; a later round
re-audits.

## The number

The high-severity queue went from **23 open defects to 21**. Before picking, I left out the
subjects that open PRs were already fixing: mcp-supply-chain-watch and caa-record-check (PR
#14747) and platform/agents (PR #14674). Both fixes are in
[PR #14750](https://github.com/Duncan-Haywood/oss-monorepo/pull/14750). Each comes with tests that
fail when the old bug is seeded back into the code.

## Medicaid look-back worksheet: notes decided the law

[The worksheet](../../ventures/medicaid-lookback-penalty-calculator/) divides gifts made inside
the look-back window by the state's penalty divisor. Federal law exempts some transfers (42 USC
1396p(c)(2)): to a spouse, to a blind or disabled child, and some home transfers to a caregiver
child or a sibling. The tool decided whether a gift was exempt with a regex over the free-text
note. The pattern listed `spouse`, `disabled`, `trust`, `sibling` and similar words. So
"daughter, not disabled", "niece, trust fund" and "spouse's cousin" each removed a $21,000 gift
from the total ([audit](../../portfolio/quality/audits/2026-11-07-medicaid-lookback-penalty-calculator.json),
defect 0). An elder-law attorney would object to this first: a family planning around the
result would see a shorter penalty than the state will apply.

Now a gift leaves the total only when its note says `exempt`, and "not exempt" and "non-exempt"
don't count. A note that names an exempt category without the marker still counts. The report
then names those lines and says to add the marker only if the transfer really qualifies. When
the tool is unsure, it now overstates the penalty rather than understating it. The audit's
medium defect, an unpinned 30-day partial-month factor, is now pinned by a case where 30 and 31
give different day counts (1.99 months is 29 days, not 30).

I seeded three bugs into the fixed code: the old keyword regex, a dropped negation guard and a
31-day factor. Each one fails a test. The suite runs 27 of 27 green.

## uitest: the smoke check passed NaN

[`platform/uitest`](../../platform/uitest/) checks the repository's own pages. Without a model
key it falls back to a smoke check: fill every field, click the safe buttons, and fail on HTTP
errors or a blank page. Its README says it catches forms that "render but never respond". But a
page that answered `Area: NaN sq ft` passed, with exit 0
([audit](../../portfolio/quality/audits/2026-11-08-uitest.json), defect 0), and no test covered
the blank-page failure (defect 1).

The smoke check now counts `NaN`, `undefined`, `Infinity` and `[object Object]` before and after
its fills and clicks. It fails the page when the interaction adds one. Counting before and after
means a page whose prose explains `undefined` is not flagged. I checked this in a real Chromium:

| page | before the fix | after |
|---|---|---|
| hand-built area form that multiplies by `parseFloat("test")` | exit 0, "smoke check passed" | exit 1, `the page shows "NaN"` |
| 9 venture pages drawn at random, plus the Medicaid page | pass | pass |

Removing either the new check or the blank-page check fails a test. All 30 uitest tests pass,
including the five real-browser ones, with `PLAYWRIGHT` set to the installed module. The README's
"Limits" section now says what the keyless check still misses: a wrong but plausible number, or
an error written in words. Those need a scripted `expectText` step or an agent goal.

## What is still not at the bar

21 high-severity defects remain open. The worst of them are a stale Clerk and Cognito rate card
in auth-mau-pricing-calculator (an 18% understatement at 950k MAU), a Garmin watch-face test that
checks a copy of the DST code instead of the shipped code, and several research projects whose
tests never touch the function that produces the reported numbers.
`python3 platform/ci/quality_audit.py queue --severity high` lists them all.
