---
title: "The lint saw 203 unguarded CSV exporters; there were 512. Red-teaming the tournament rating calculator"
seo_title: "Tournament rating CSV: formula injection fixed, CSV lint widened"
date: 2026-11-13
tags: [testing, mutation-testing, chess, glicko-2, elo, csv-injection, security, redteam]
description: "Ten faults seeded into new Elo and Glicko-2 code, seven caught. Player names could run as spreadsheet formulas, and the CSV lint only knew one name."
---

The [Tournament Pairing Manager](../../ventures/tournament-pairing-manager/)
gained Elo and Glicko-2 rating changes this morning: finish a Swiss event or a
bracket and it shows what the event does to each player's rating, with a CSV
download. Today's red-team run seeded ten faults into the new
`ratings.mjs` (`redteam.py campaign`: change one operator or constant, run the
tests, put the file back) and then read the code looking for a wrong answer.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `tournament-pairing-manager/ratings.mjs` | 10 | 7 | 1 | 9 of 9 |

## What got through

- **A bye on the other side of a bracket match.** Swapping `||` for `&&` in the
  "is this a real game?" test went unnoticed, because every bracket the tests
  built put the bye on the same side. A new test hands `gamesFromBracket`
  matches with the bye on each side and with a side missing.
- **The CSV's rounding.** Turning `x * 10` into `x / 10` made every rating
  in the download one hundred times too small. The tests only counted the CSV's
  rows. They now pin the rating, change and RD cells.
- **One equivalent mutant.** Glickman's volatility search (step 5 of his
  worked example) starts its bracket at `ln(Δ² − φ² − v)`. Changing the
  minus before `φ²` to a plus just starts the bracket somewhere else that still
  contains the same root. Over 200,000 random players the answer moved by at
  most 5 × 10⁻⁷ of itself, below the solver's own tolerance and below the six
  decimals the CSV prints. So no test can see it, and that is correct.

## What was actually wrong

Player names went into both CSVs (rating changes and standings) exactly as
typed. A name such as `=HYPERLINK("http://…","Win")`, put in a saved event file
and passed to a club secretary, runs as a formula when the download is opened
in Excel or Google Sheets (CSV injection, CWE-1236). The fix is the
repository's usual one: a cell that starts with `=`, `+`, `-`, `@`, a tab or a
carriage return gets an apostrophe in front, unless it is a plain number, so a
rating change of `-12.8` stays a number.

The repository already had a lint for exactly this,
`platform/ci/check_csv_formula_guard.py`, added yesterday. It passed. It
counted a file as a CSV exporter only if it defined a function called `toCsv`,
and these two are `ratingsCsv` and `standingsCsv`.

## Fixing the class

The lint now also counts any exported function whose name ends in `Csv`,
leaving out readers and fixtures (`parseCsv`, `splitCsvLine`, `sampleCsv` and
the like). Unguarded exporters it can see went from 203 to 512 (510 after
today's two fixes): the 203 it already knew about and 309 it never looked at
(`reportCsv`, `findingsCsv`, journal exports and many more). They go on the
ratchet baseline, so no new unguarded exporter can land and the list can only
shrink. Many of those export numbers only, with nothing a visitor typed, so
the real exposure is smaller than the count. But a lint that does not look at a
file cannot tell you which is which.

The open item for the next run is to work down that list, starting with the
exporters that write names, notes or descriptions a person typed.
