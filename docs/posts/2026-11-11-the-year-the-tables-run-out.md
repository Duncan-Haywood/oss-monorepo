---
title: "The year the tables run out: three fallbacks that disagreed with themselves"
seo_title: "Tax-year fallback bugs: QBI $400 minimum and the nanny-tax threshold in 2027"
date: 2026-11-11
tags: [tax, qbi, section-199a, mutation-testing, red-team]
description: "A tax calculator keeps a table per year. When the year asked for isn't in it, every lookup has to fall back the same way. Two of ours didn't, and a shared file's copies drifted."
---

Every tax tool in this repository keeps a table per year: thresholds, wage bases, phase-in
ranges. Sooner or later someone asks for a year that is not in the table. The code usually
handles that with a fallback like `TABLE[year] || TABLE[latest]`. Today's red-team run found
the same bug twice: one lookup in a function had the fallback and another lookup in the same
function didn't. So for one year the answer used half the right numbers.

## The QBI calculator and 2027

The [QBI deduction calculator](../../ventures/qbi-deduction-calculator/) works out the
Section 199A deduction. Its threshold lookup fell back to the latest year in the table
(2026). The OBBBA $400 minimum deduction read `THRESHOLDS[taxYear]` directly, with no fallback.
Ask for 2027 with $5,000 of QBI and $500,000 of taxable income, and you got the 2026
thresholds but no floor:

| Tax year asked | Deduction before the fix | After |
|---|---|---|
| 2026 | $400 | $400 |
| 2027 | $0 | $400, plus a note that 2026 figures were used |

The minimum deduction is permanent, so 2027 should get it too. The web page only offers 2025
and 2026, so the people this reached are callers of the exported `computeQbiDeduction`, the
function the README documents. Now a single `modelledYear()` picks the table for both lookups,
and a finding says which year's figures were used. Those figures are indexed for inflation, so
the user should check the real ones.

## The babysitting kit and January

The [babysitting business kit](../../ventures/babysitting-business-kit/) warns a sitter when one
family has paid them past the IRS household-employee threshold (Publication 926), because
the family may then owe nanny tax. The Social Security wage base in the same function already
has a 2027 row. The household threshold stops at 2026 and had no fallback. The page asks for
the current year, so from 1 January 2027 the warning would have quietly stopped showing.
Now it falls back to the latest threshold on file and says so. The threshold rises with
inflation, so the warning stays on.

## A shared file whose copies drifted

Before measuring anything, the run found the babysitting kit's test suite already red on
`main`. Yesterday a fix to `platform/llm/byok.mjs` started counting Gemini's thinking tokens
in usage. Sixteen ventures carry a copy of that file, and none of the copies were updated. Ten
of them have a test saying the copy must match, and all ten went red. CI didn't notice
because venture suites run only when their own venture changes. This run synced the sixteen
copies, and `platform/llm/byok.test.mjs` now checks every copy. That test already runs on any
change under `platform/llm/`, so the next edit that skips the copies fails in the same PR.

## The mutation numbers

The run seeded 16 faults into the QBI calculator's `calc.mjs`, and its tests caught 11. The 5
that got through show what had never been tested. The 2.5%-of-UBIA half of the wage limit had
never been exercised with any UBIA. The scaling of an SSTB's UBIA had never been tested. An
SSTB at exactly the top of the phase-in range had never been tested. Neither had the default
tax year, or the QBI counted for a loss. Each one now has a test that fails when the fault is
put back. Catch rate: 11 of 16 before, 16 of 16 after.

*These are estimates from published formulas, not tax advice. Check the IRS figures for your
year.*
