---
title: "An order placed in the year 123. Red-teaming the delivery commission analyzer"
seo_title: "Mutation testing a CSV date parser: three-digit years and NaN checks"
date: 2026-11-14
tags: [testing, mutation-testing, redteam, restaurants, csv]
description: "22 faults seeded into the delivery commission analyzer, 10 caught. Two real bugs: a mistyped year read as 0123, and a non-number fee passing validation."
---

Today's red-team run aimed at `ventures/restaurant-delivery-commission-analyzer/calc.mjs`,
the code behind the [delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/).
You drop a DoorDash, Uber Eats or Grubhub export on it, and it works out what each
platform really kept and which orders lost money. Its suite runs in a third of a
second, so `redteam.py` could run two campaigns: 22 faults seeded one at a time,
each followed by a suite run and a byte-for-byte restore. The suite caught 10.
Four of the 12 that got through could not change anything a user sees, so the
catch rate is 10 of 18, or 56%. After this run's tests it is 18 of 18.

## What got through

Most of the 8 real escapes were in the date and time parser, the part that has to
cope with whatever clock format a platform's export uses:

| Line | Fault | Why it got through |
|---|---|---|
| 117 | month `> 12` to `>= 12` | no test parsed a December date |
| 137 | day-first detection, `> 12` to `>= 12` | no file had a first part of exactly 12 |
| 124 | `12 AM` rule flipped (`===` to `!==`) | the only AM test was not at 12, and no test checked a morning hour |
| 241 | pooled sign tally starts at 1 | no file had a tied column decided by a one-vote majority |
| 296 | markup needs net `> 0` changed to `> 1` | no platform netted under a dollar |
| 321 | own-ordering fee check, `\|\|` to `&&` | no test passed a fee of 100% or more |
| 450 | promo "bad" test, `< 1` to `<= 1` | no promotion broke exactly even |
| 484 | percentages to two decimals | `pct()` had no test |

Each now has a test that fails with the fault in place and passes without it.
Four escapes were equivalent, meaning no user could see a difference. A `24:00`
clock already fails the date check because `Date.UTC` rolls it into the next day.
The sample file's random draw never lands on exactly 0.04, so its output is
byte-identical either way. The first synthetic order ID is just a label. And once the year fix below
went in, a year of exactly 100 could no longer reach the line that adds 2000.

## Two real bugs

Reading the parser the way a stranger's spreadsheet would test it turned up two
defects that the seeded faults had missed.

**A three-digit year was accepted.** The slash date pattern took 2 to 4 digits for
the year, so a typo like `1/2/123` came out as 2 January 0123. That row then
counted as an order, and the report's date range started in the year 123. Two-
and four-digit years are the only forms exports use, so the pattern now takes
just those. A mistyped row is skipped and counted with the others, as it
should have been.

**A fee that was not a number got through validation.** The own-ordering
comparison checked `directPct < 0 || directPct >= 1`. Both comparisons are false
for `NaN`, so a fee that was not a number passed. The finding then read "at NaN% +
$0.30 per order" and every direct-ordering gain was `NaN`. The page's number
inputs can't send that value, but `analyze()` is exported, and other code can
call it. The check is now written as `!(directPct >= 0 && directPct < 1)` and
requires a finite flat fee, so `NaN` fails it. The sibling restaurant tools
already turn their inputs into finite numbers before checking them, so this one
was alone.

## Takeaway

Write range checks so that they pass only what is valid: `!(x >= 0 && x < 1)`
rejects `NaN`, while `x < 0 || x >= 1` lets it through. And for a date regex,
`\d{2,4}` also allows three digits.
