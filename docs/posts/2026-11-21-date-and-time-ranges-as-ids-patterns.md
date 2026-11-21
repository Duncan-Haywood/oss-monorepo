---
title: "Date-and-time ranges in IDS files, written as patterns IfcTester reads the same way"
seo_title: "IDS dateTime ranges as exact patterns for IfcTester"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "Our free IDS editor now writes a date-and-time range as one XSD pattern. With the model open, 0 of 400 door verdicts differ; IfcTester agrees 20 of 20."
---

An IDS file can ask that a property hold a date and time inside a range:
"inspected on or after 2024-05-01T08:00:00", written as an `xs:dateTime`
restriction. IDS 1.0 allows it. IfcOpenShell's IfcTester 0.9.0, the checker
most teams run, reads range bounds as numbers, so it fails every object on
such a range. In our test, 41 of 41 doors failed on all 10 ranges, where
the range itself fails 12 to 40 of them.

Last week the free [IDS editor](https://marisstella.app/ids-model-check/editor.html)
got a **Write as a pattern** button for date ranges: it turns the range into
one XSD pattern that matches exactly the days the range allows, and both
checkers read a pattern the same way. Date-and-time rows now have the button
too. A date and time is harder than a plain date for two reasons:

- **Fractions.** `08:00:00.0001` is a valid value, with as many digits as
  the writer likes. The pattern compares the fraction digit by digit, so
  "more than 07:59:59.9999" lets `07:59:59.99991` through and stops
  `07:59:59.9999`.
- **Time zones.** `2024-05-01T09:00:00+01:00` is the same instant as
  `08:00:00Z`. A pattern reads text left to right, and the zone comes
  last, so a pattern that placed every zone exactly next to a bound would
  run to hundreds of kilobytes.

So the pattern is exact for values written with no zone, `Z` or `+00:00`,
which is how IFC exporters write them. It's also exact for any zone more than
a day inside the range, and, when you have a model open, for the zones that
model actually uses. A value in some other zone within a day of a bound
doesn't match, and the editor says so next to the button.

## How it was checked

We built 40 doors, each carrying one date and time placed on an edge:
fractions past the millisecond, `24:00:00` (midnight at the end of a day),
whole-hour and half-hour zones, days that don't exist, non-ASCII digits. We
checked them against 10 ranges.

| | pattern, no model | pattern, model open |
|---|---|---|
| door verdicts unlike the range | 30 of 400 | 0 of 400 |
| same failing doors as IfcTester 0.9.0 | 10 of 10 | 10 of 10 |

All 30 differences are zoned values within a day of a bound. A unit sweep
compares the pattern with the checker on tens of thousands of strings
around each bound. It finds only that gap, and only in one direction: the
pattern never passes a value the range fails.

The work turned up a bug in our own checker. JavaScript's `Date.parse`
keeps three fraction digits, so `00:00:00.0004` came out equal to
`00:00:00` and failed "more than midnight". XSD orders it after midnight.
The checker now compares the remaining digits too.

The write-up with every number is in the repository:
`ventures/ids-model-check/eval/datetime-pattern-2026-11-21.md`. The editor
runs in your browser and the model never leaves your machine. It's an
estimate of what a checker will say, not a substitute for running the one
your project uses.
