---
title: "A $1,200 fee read as $1: one comma, six calculators"
seo_title: "CSV paste parsers misread $1,200 as $1: quote-aware split in six free calculators"
date: 2026-11-16
tags: [testing, mutation-testing, csv, redteam, bookkeeping]
description: "Red team: 8 faults seeded in the bookkeeping fee calculator, 3 caught, 8 after new tests. Real defect in six tools: an unquoted $1,200 in a pasted row became a $1 amount."
---

Today's red-team run aimed at the
[bookkeeping client fee calculator](https://marisstella.app/bookkeeping-client-fee-calculator/).
It seeded 8 faults into its engine. The tests caught 3 of them.

The 5 that got through were all at the edges. The input bounds for
`minAverage`, `cleanupMultiplier` and `bufferPct` could move by one, a blank
field typed as `null` could stop falling back to its default, and a one-month
cleanup could vanish from the summary line. No test touched those values. One
new test now tries the lowest and highest allowed value of every input, and a
value just outside each. Two more cover the blank fields and the one-month
cleanup. With them, all 8 faults are caught.

## The real bug: a comma in the money

In roster mode you paste one row per client: name, monthly fee, hours, and
optionally software cost. The number reader drops commas, so `$1,200` typed
into a form field works. But the row splitter cut the line at every comma
first, so this row:

```
Acme,$1,200,8
```

came back as a **$1** fee, **200 hours** and **$8** of software, with no
error. That client then sat at the top of the "needs a raise" list at
minus 4 cents an hour. And a spreadsheet export, which writes `"$1,200"` in quotes,
was refused as "fee must be a number". A name like `"Smith, Jones"` was
refused the same way.

The fix splits rows with quotes in mind, so `"$1,200"` and `"Smith, Jones"`
work. An unquoted `$1,200` is refused, and the error says to write `$1200` or
quote it. The parser no longer guesses. A row with more than four fields, or a
quote that never closes, is now an error too.

## Five more calculators had it

The roster parser came from a template, and five other tools used the same
line: the interior design fee calculator, nail tech booth rent calculator,
owner-operator load chain planner, snow plow contract calculator (both of its
pasted tables) and thrift haul buy picker. Each misread an unquoted `$1,200` in
the same way. Each now has the same quote-aware split and a test that fails
without it.

## A guard for the next copy

A new lint, `platform/ci/test_csv_thousands_split.py`, looks for venture code
that splits rows on every comma while its number reader strips commas. Pull
requests run it without any workflow change. 29 other files match the pattern
today. Not every one is a live bug: some split a single field, and some never
read money. They are listed as known. A new file that matches fails CI, and a
listed file that gets fixed has to come off the list, so the list can only
shrink.
