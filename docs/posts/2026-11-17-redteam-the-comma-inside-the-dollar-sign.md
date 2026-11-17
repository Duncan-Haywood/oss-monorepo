---
title: "The comma inside $1,200: eight tools that broke on a spreadsheet export"
seo_title: "Why pasting spreadsheet CSV broke eight free calculators, and the fix"
date: 2026-11-17
tags: [redteam, csv, parsing, testing, mutation-testing]
description: "A spreadsheet CSV export quotes \"$1,200\", and that broke the card grading picker and seven sibling tools. All eight now read quoted cells."
---

Type a card's raw value as `$1,200` in a spreadsheet, export the sheet as CSV,
and the cell comes out as `"$1,200"`, in quotes. The quotes are how CSV keeps
the comma inside the number from splitting the cell in two.

The [card grading submission picker](https://marisstella.app/card-grading-submission-picker/)
splits each row on every comma. Its number reader strips thousands
separators, but no number could ever reach it with a comma still inside, so
that step did nothing. A row like

```
Charizard,"$1,200","$8,000","$3,000","$1,500",900,30%,40%,20%
```

came back as `raw value must be a number of dollars, zero or more`, an error
about a number that was valid. A card named `"Base Set, 1st Edition"` broke
the same way.

## How it turned up

This was a red-team run. The tool seeds small faults into one file and counts
how many the file's own tests catch. It drew the picker's `engine.mjs` and
seeded eight faults. The tests caught three:

| Fault | Caught before | After the new tests |
|---|---|---|
| `0.5%` rejected as a chance (`n < 0` became `n < 1`) | no | yes |
| card values under $1 rejected | no | yes |
| the cheaper of two equal-value sets lost the tie-break | no | yes |
| the exact search reporting `exact: false` | no | yes |
| one sort tie-break in label pruning | no | equivalent: the same answer either way |
| three others | yes | yes |

That is 3 of 7 real faults before (one turned out to be equivalent) and 7 of 7
after. A second campaign on a contractor proposal module caught all 8 of its
faults with no changes.

Reading the parser by hand to hunt for real bugs is what turned up the quote
problem. A plain-text search of every `ventures/*/*.mjs` file that strips commas
from numbers and also splits rows on commas found 27 files. Most were splitting
tag lists, where a plain split is fine. Seven were row parsers that users fill by
pasting from a spreadsheet or a booking export:

- **401(k) plan fee calculator:** `"$12,500"` as a balance became a 500%
  expense ratio, which the tool did at least flag as looking wrong.
- **SaaS renewal planner:** `"Acme, Inc","$12,000",...` failed on the
  auto-renew column.
- **Embroidery shop quote calculator:** `"Team shirts, navy",24,...` did not
  fail. It shifted every column one place to the right, so the quantity became
  `navy"`.
- **Dog grooming price calculator, construction delay claim calculator, UCR
  fee calculator, cash-flow risk forecaster:** a quoted name with a comma in it
  failed the row.

## The fix

All eight files now share one small splitter. A row without a `"` is split
exactly as before, so nothing that already worked changes. A cell that starts
with a quote runs to the closing quote, and `""` inside it is a literal
quote, which is the usual spreadsheet convention. Each of the eight test
suites has a new test, and each new test fails against the old code (checked
by putting each old file back in place and running its suite).

The cash-flow forecaster still refuses `1,200` as an amount, and its error
message says so ("no commas"). That was already a deliberate choice, so the
fix only makes quoted descriptions work there.

The next step is a shared helper rather than eight copies of one. For now each
venture keeps its own copy, because each one is a self-contained folder that
someone can fork and deploy on their own.
