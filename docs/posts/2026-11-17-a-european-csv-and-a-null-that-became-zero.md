---
title: "A European CSV, and a missing reading that became a zero"
seo_title: "Red-teaming a Passing-Bablok and Bland-Altman tool"
date: 2026-11-17
tags: [redteam, method-comparison, passing-bablok, bland-altman, testing]
description: "A red-team run on the new method comparison tool found that a semicolon CSV with decimal commas was silently misread, and that a null reading entered every fit as 0."
---

The [method comparison tool](https://marisstella.app/method-comparison/) shipped yesterday: paste the
readings of two methods on the same samples and it gives Passing-Bablok and Deming regression,
Bland-Altman limits and the difference at decision levels. Its numbers were already checked against an
independent Python reference and against Bland and Altman's 1986 peak-flow example. Today's red-team run
asked two other questions: would the tests notice if a later change broke the engine, and what does a
stranger type that gives a wrong answer?

## Three wrong answers a stranger could get

**A semicolon CSV from Excel.** In Germany, France and most of Europe, Excel saves "CSV" with semicolons
between columns and commas as the decimal mark: `4,1;4,3`. The parser chose its separator by checking for
a comma first, so it split `4,1;4,3` into `4`, `1;4` and `3`. Without a header row, the first data row
became a header, and every later row was read as its integer part on one side and its decimals on the
other: the pair (5,0; 5,4) went in as x = 5, y = 4. No error, and a Bland-Altman bias that had nothing to
do with the data. With a header row the file was refused instead. Now a semicolon on every one of the first
lines picks the semicolon, and decimal commas in such a file are read as decimals.

**A missing reading.** From code or an agent, readings go in as two arrays. They were converted with
JavaScript's `Number`, which turns `null`, `""` and `false` into 0, so a sample with no reading from one
method entered every fit as a reading of zero. Now anything that is not a number or a numeric string is
an error that says to leave that pair out.

**One decision level.** `decisionLevels: 130` (a number, not a list) crashed with `map is not a function`.
It now accepts a number, `"120, 140"` or an array.

The same `Number(null) === 0` pattern was in two sibling tools' array input. In the
[probability calibration](https://marisstella.app/probability-calibration/) tool it was worse: any outcome
other than `true`, `1` or `"1"` counted as a non-event, so outcomes written `"yes"` all became 0. Both now
refuse a reading they cannot read, and the calibration tool accepts yes/no words there as its CSV reader
already did. The [Lomb-Scargle periodogram](https://marisstella.app/lomb-scargle-periodogram/) had the
same zero for a missing time or value.

## Seeded faults

The run made 24 small edits to the engine, one at a time. Nine could not change any answer (a convergence
check that only saves iterations, a write past the end of a typed array, a change to the sample id column).
Of the other 15, the tests caught 10. The five that got through:

- two changes to the tie correction in Kendall's tau variance, which the reference data had too few ties to
  see. The new test enumerates all 5,040 orderings of a small tied data set and checks the variance against
  the formula, so it does not trust the formula it tests;
- a Bland-Altman sum of squares starting at 1 instead of 0, invisible in a one-decimal SD of 38.8;
- choosing only the y column, when it is the first column, being overridden;
- the CUSUM test's "this point is on the line" threshold shrinking for large readings.

With five new tests all 15 are caught. Catch rate 67% before, 100% after; the record is
`prompts/runs/2026-11-17-session_01EhTJVMk7wqpK5U4MvCckzm.json`.
