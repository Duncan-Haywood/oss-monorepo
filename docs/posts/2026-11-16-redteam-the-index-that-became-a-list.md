---
title: "The index that became a list: red-teaming two calculators fixed yesterday"
seo_title: "JavaScript map(fn) passed an index where a list belonged"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, home-inspection, campground]
description: "20 faults seeded into two files changed yesterday, 12 caught. The home inspection report would not build if a repair cost on the second finding was negative."
---

Today's red-team run went to two files that a quality pass changed yesterday:
`calc.mjs` in the [home inspection report builder](https://marisstella.app/home-inspection-report-builder/),
which turns an inspector's findings into a printable report, and `calc.mjs` in
the [campground site profit calculator](https://marisstella.app/campground-site-profit-calculator/).

## Seeded faults

`prompts/redteam.py` changed one thing at a time (a `>` into `>=`, a `1` into
`2`, a `-` into `+`), ran each product's tests and put the file back. Of 20
changes, the tests caught 12. One could not change anything a user sees: a
fallback severity rank that only runs for a severity the code has already
replaced. The other seven were real gaps:

- the home inspection tool, when only the high repair cost is filled in, could
  print "$0 to $300" instead of "$300";
- a saved file could change its format number with no test noticing;
- exactly 500 findings could warn that some were left out (the cap is 500);
- the campground calculator could say a park that exactly breaks even "loses
  about $0.00 a year";
- the "near break-even" warning had no test at all, so it could have been
  removed, made to fire at 10 points clear instead of under 10, or made to
  depend on occupancy *plus* break-even.

Each gap now has a test that fails with that change and passes without it.
Re-run, all 19 changes that could matter are caught.

## A report that would not build

Reading the home inspection code turned up a real bug. The function that
cleans up a finding is `normalise(finding, issues)`: when a repair cost is
negative or not a number, it ignores the figure and adds a note to the
`issues` list so the inspector hears about it. The report built its list with
`findings.map(normalise)`.

`map` calls its function with three arguments: the item, its position and the
whole array. So `normalise` got the position as `issues`. For the first
finding that is 0, which JavaScript treats as "no list", so the note was
dropped. For the second finding it is 1, and `1.push(...)` throws. In a
browser, with two findings and "-5" typed into the second one's low cost
(the number box takes it although its minimum is 0), "Build the report" did
nothing and the console said `issues.push is not a function`. "Download as
text" failed the same way.

The fix calls `normalise(f, issues)` with a real list, and the page now shows
what it ignored: *Check these before you send the report: "Gutter": low cost
"-5" is not a non-negative number; ignored.* `normalise` also checks that it
was given a list before it writes to it.

## The same mistake elsewhere

Passing a function straight to `map` is common and usually fine. It only goes
wrong when the function's second parameter means something other than a
position. A new check, `platform/ci/check_map_callback_args.py`, reads every
product's top-level functions, including ones a page imports from its module.
It flags `.map(f)`, `.forEach(f)`, `.filter(f)` and the other per-item methods
when `f`'s second parameter is not named like a position (`i`, `idx`,
`index`, ...). Across about 1,300 products it found the two home inspection
calls and one more: the quote margin checker's CSV export passed
`csvCell(value, { text = false } = {})` to `map`. That one did no harm, since
unpacking a number leaves `text` at false, the default. It is now wrapped
anyway. The check takes about a second, and `unwired_checks.py` runs it on
every product pull request with no workflow change.

## A warning that came too late

The campground calculator warns "One rainy month can turn it into a loss" when
occupancy is within 10 points of break-even. It also fired *below* break-even,
so at 35% full on the sample inputs the page said the park "loses about
$16,385 a year" and, two lines later, that a rainy month could turn it into a
loss. Below break-even it now says how far off you are: *Break-even is 41% full
and you run 35%: you need about 404 more occupied nights a season to cover the
fixed costs.*

## The numbers

| | seeded | caught before | caught after |
|---|---|---|---|
| home-inspection-report-builder/calc.mjs | 10 | 6 | 9 (1 can't change output) |
| campground-site-profit-calculator/calc.mjs | 10 | 6 | 10 |

Two real defects, both fixed with a failing test first, and one new CI check.
