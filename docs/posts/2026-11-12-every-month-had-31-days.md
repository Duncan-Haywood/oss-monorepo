---
title: "Every month had 31 days: six import checkers and a bank-statement converter"
seo_title: "Validating a day of the month in JavaScript: why d <= 31 is not enough"
date: 2026-11-12
tags: [bank-statement-pdf-to-csv, quickbooks, salesforce, schedule-c, dates, javascript, mutation-testing, redteam]
description: "A bank-statement converter exported 02/30 as 2026-02-30, and five import checkers shared its day check. All now use the real calendar."
---

Today's red-team run seeded ten faults into `calc.mjs`, the parser behind the
[bank statement PDF to CSV converter](../../ventures/bank-statement-pdf-to-csv/). The
tests caught four. Two of the six that escaped could not change anything a user sees (the
year kept on a date that is already marked unreadable, for one). The other four were real
holes: nothing checked that a printed "Total deposits" line that disagrees with the rows
raises a warning, in either direction; nothing checked that an impossible date raises the
"could not be read" error; nothing pinned what counts as a bare dotted value date; and
nothing covered a row that shares the date above it after a stray line has closed the
transaction. Each now has a test, and the rerun shows all four caught.

Writing the date test turned up the real defect. The converter decided whether a day and
month were a date like this:

```js
const validDmy = (d, m) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
```

Every month had 31 days. A statement line dated `02/30/2026` came through as a valid
transaction, the balances agreed, no error was raised, and the CSV carried `2026-02-30`.
Xero and QuickBooks either refuse that row on import or, worse, roll it to 2 March. The
error that should have fired, "1 date could not be read", was never reached.

The fix has two steps, because a statement often prints dates without a year. The month
lengths are checked when the line is read, with February allowed its 29th. Once the year
is known (printed, taken from the statement period, or this year as a last resort), 29
February is checked again against it. A statement for February 2027 with a row dated
`29/02` now says the date cannot be read instead of exporting a day that never happened.

## Five more copies

The same check, `d >= 1 && d <= 31` next to a month range, turned up in five more
products, each of which reads dates out of a file somebody is about to import:

- the [QuickBooks import CSV checker](../../ventures/quickbooks-import-csv-check/), whose
  own test asserted that `2026-02-30` was a fine ISO date, and which read `02/30/2026`
  as a month-first date rather than a bad one;
- the [Salesforce lead import checker](../../ventures/salesforce-lead-import-csv-check/),
  which counted `2026-02-30` as valid and could rewrite an ambiguous column into
  `YYYY-MM-DD` dates that do not exist;
- the [QuickBooks IIF file checker](../../ventures/quickbooks-iif-file-check/), whose
  repair step would rewrite `2024-02-30` into `02/30/2024` for QuickBooks to choke on;
- the three Schedule C and Schedule E categorizers
  ([freelancer](../../ventures/freelancer-schedule-c-categorizer/),
  [self-employed](../../ventures/self-employed-schedule-c-categorizer/),
  [rental property](../../ventures/rental-property-schedule-e-categorizer/)), which share
  one `parseDate` and turned `02/30/2026` into a `2026-02-30` row.

Each now builds the date with `Date.UTC` and checks it gets the same month and day back,
and each has a test with 30 February, 31 April and 29 February in a common and a leap
year. Two siblings already did this round trip (the no-show and hourly-yield analyzers),
which is how the search could tell the safe copies from the broken ones.

## A lint for the next copy

Yesterday's run [found thirteen validators that trusted `Date.parse`](2026-11-11-thirteen-validators-that-took-february-30.md)
to reject 30 February and added `platform/ci/check_calendar_dates.py` for that shape. This
is the other shape of the same mistake, a hand-written range, and that lint did not see
it. It now flags a line that range-checks a month and a day of 1 to 31 with no calendar
check (a `getUTCDate` round trip, a month-length table, a `realDay` or `calDate` helper)
on that line or the four after it. Run on the seven files as they were before today it
flags eight lines, at least one in each; on `main` after this change it finds none. A range like "days open per month, 1 to 31" has no month next
to it and is left alone.

What this does not show: these tools check a file before you import it. None of this was
run against Xero, QuickBooks or Salesforce themselves, and what they do with an impossible
date (refuse it, or roll it forward) depends on the version and the import path.
