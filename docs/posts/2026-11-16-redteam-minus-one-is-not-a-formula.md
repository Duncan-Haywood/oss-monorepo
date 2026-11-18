---
title: "Minus one is not a formula: one CSV guard, written two wrong ways across 87 tools"
seo_title: "CSV injection guards that turned negative numbers into text"
date: 2026-11-16
tags: [security, csv-injection, testing, mutation-testing, javascript, redteam]
description: "A red-team run found one CSV export that let a formula through and about a hundred that turned plain negative numbers into text. One lint now checks both."
---

Most of the tools in this portfolio can export a CSV. When someone opens a CSV
in Excel or Google Sheets, a cell that starts with `=`, `+`, `-` or `@` can run
as a formula. That attack is CSV injection (CWE-1236). The usual defence is
to put an apostrophe in front of such a cell so the spreadsheet reads it as
text, and a CI check (`platform/ci/check_csv_formula_guard.py`) already makes
sure every exporter has that guard.

Today's red-team run found the guard was wrong in two opposite ways.

## Too little: `-1+HYPERLINK(...)` went through

The [insurance commission reconciler](https://marisstella.app/insurance-commission-reconciler/)
compares an agency's book of policies with the carriers' commission
statements, and exports the findings as a CSV. Its guard read:

```js
if (/^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s)) s = "'" + s;
```

The minus sign was left out of the first test so negative amounts would stay
numbers. The second test only defuses a minus that is *not* followed by a
digit. So an insured name of `-1+HYPERLINK("http://x","y")` (one row in a
book file someone sends you) went into the findings CSV unchanged, and a
spreadsheet would run it. A failing test reproduced it, and the fix tests the
whole cell instead of its first two characters:

```js
if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
```

Only a cell that is entirely a plain number may start with a minus.

## Too much: `-12.50` became text

The other mistake was far more common. About a hundred copies of the guard,
across 87 ventures, defused *every* leading minus. A negative amount came out
as `'-12.50`, so the column could not be summed, sorted or imported.
Some examples:

- In the [shift roster builder](https://marisstella.app/shift-roster-builder/),
  the predictive-scheduling change log exports notice hours for each change.
  When a manager cuts a 9-to-5 shift to 1 pm at 10 am, the change came an hour
  after the shift started, so its notice is -1 hours. The CSV said `'-1`.
- In the [gig driver net pay calculator](https://marisstella.app/gig-driver-net-pay-calculator/),
  a losing session has a negative net profit. Its guard also skipped tab and
  carriage return, which the other copies cover.
- The duplicate payment audit's own test asserted that `-1` should be
  written as `'-1`, which treated the bug as the intended behaviour.

A plain number cannot be a formula. Excel and Sheets read `-12.50` as minus
twelve fifty, so letting it through costs nothing. Every copy now uses the
same anchored exemption. Four test files had asserted the old `'-1` output,
and now check that `-1` stays a number and `-1+2` is still defused.

## The guard that keeps it fixed

Fixing a hundred copies by hand only lasts until the next copy is pasted in.
So `check_csv_formula_guard.py` now also checks the guard's shape, with no
baseline to hide behind. Any line that writes the apostrophe must:

1. test all six leading characters, `= + - @ \t \r`; and
2. let a plain number through, either with an anchored `/^-?\d+(\.\d+)?$/`
   or with a `typeof ... "number"` test.

Lines that only *warn* about a cell are left alone. The CSV checker products
do this when they flag a formula-looking cell in a user's file. The check
and its tests run through `platform/ci/unwired_checks.py` on every pull
request that touches `ventures/`. With the old insurance
guard in a test fixture it fails, and on today's tree it passes.

## The seeded faults

The run also seeded 18 faults (mutants) with `prompts/redteam.py`:

| target | seeded | caught by its own tests | after new tests |
|---|---|---|---|
| `teachers-pay-teachers-earnings-analyzer/usage.mjs` | 8 | 5 | 8 |
| `platform/ci/check_social_proof.py` | 10 | 9 | 9 (1 equivalent) |

The three usage-counter mutants that escaped are shape checks on stored
values. The repo-wide `usage_contract.mjs` already catches them in CI, and
that copy's own suite now does too. The one social-proof mutant that escaped
moves the script's own directory from position 0 to 1 on `sys.path`, which
changes nothing when the script is run.

## What this means if you use these tools

If you exported a CSV from one of these tools before today and saw numbers
with a leading apostrophe, delete the apostrophe or export the file again.
The amounts themselves were always correct. Only how they were written into
the file was wrong. If you rely on the insurance reconciler's findings CSV and
open book files from outside your agency, export it again: before today, a
crafted name in a book file could reach your spreadsheet as a live formula.
