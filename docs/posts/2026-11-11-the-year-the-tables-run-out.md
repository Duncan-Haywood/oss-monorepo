---
title: "The year the tables run out: two fallbacks that disagreed with themselves"
seo_title: "Tax-year fallback bugs: the $400 QBI minimum and 2027"
date: 2026-11-11
tags: [tax, qbi, section-199a, mutation-testing, redteam]
description: "When a tax table lacks the year asked for, every lookup must fall back the same way. Two of ours did not, and a shared file's 16 copies drifted."
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

After that merged, a sweep of all 1,330 venture suites found two more red on `main`.
[Open House Plans](../../ventures/open-house-plans/) keeps a copy of the
[Wall Framing Takeoff](../../ventures/wall-framing-takeoff/) engine and checks it matches the
source byte for byte. The engine had changed by about 400 lines and the copy hadn't. Re-copying
it moves the plans' lumber orders by a board or two, for example 1,000 to 1,001 board feet on
one plan. The other was a sweep that added a `<main>` landmark to a generated page by hand.
Its generator didn't write one, so the page's "is it current" test failed. The same thing had
broken the sales cadence guide above. Both generators now write the landmark. The guard for the
copy problem: `run_venture_tests.py --changed` and `--since` now also run every venture whose
code points into a changed one as `../<slug>/`. A change to the framing engine now runs Open
House Plans' tests too.

## The mutation numbers

The run seeded 16 faults into the QBI calculator's `calc.mjs`, and its tests caught 11. The 5
that got through show what had never been tested. The 2.5%-of-UBIA half of the wage limit had
never been exercised with any UBIA. The scaling of an SSTB's UBIA had never been tested. An
SSTB at exactly the top of the phase-in range had never been tested. Neither had the default
tax year, or the QBI counted for a loss. Each one now has a test that fails when the fault is
put back. Catch rate: 11 of 16 before, 16 of 16 after.

*These are estimates from published formulas, not tax advice. Check the IRS figures for your
year.*
