---
title: "A date that does not exist moves your revenue: strict CSV import in Rev Rec and MRR Pulse"
seo_title: "Why a Stripe CSV importer should refuse 30 February"
date: 2026-11-18
tags: [ventures, rev-rec, mrr-pulse, redteam]
description: "JavaScript reads 2026-02-30 as 2 March and '€ 1.000' as one euro. Two of our Stripe finance tools now skip those rows with a reason instead of guessing."
---

Today's red-team run aimed at two finance tools that read a CSV someone pasted:
[Rev Rec](https://marisstella.app/rev-rec/) (a deferred revenue schedule from
invoice lines) and [MRR Pulse](https://marisstella.app/mrr-pulse/) (MRR, churn
and cohorts from a subscription export). We looked for inputs a stranger might
paste that give a wrong number and no warning. We found three.

## 1. 30 February becomes 2 March

`Date.parse("2026-02-30T00:00:00Z")` does not fail in V8. It returns 2 March.
Both importers passed dates through `Date.parse`, so a typo in a period start
moved the revenue into the next month, and nothing on the page said so. Most of
the repository's date parsers already check that a day round-trips. These two
didn't. They do now: a day that does not exist marks the row as skipped
("period start is not a date"), the same as any other unreadable date.

## 2. `€ 1.000` read as one euro

Rev Rec already read `1.234,50` as 1234.50, because a comma followed by one or
two final digits is a decimal comma. A whole-euro amount with a dot as the
thousands separator, `€ 1.000`, has no comma. The importer read it as 1.000,
which is one euro, so that row came out a thousand times too small. Nothing in
the text can tell "one thousand" apart from "one, to three places". But a
two-decimal currency is never written to three places, so the row is now
skipped: "amount has more decimals than EUR allows (is . a thousands
separator?)". Padding zeros such as `5000.00` yen still import. A non-zero
extra digit, like `100.5` yen, is skipped.

## 3. A mistyped end date reads as "still a customer"

In MRR Pulse, an `ended at` value that did not parse (say `soon`, or 2026-02-30)
came back as "no end date". The rebuilt history then counted that canceled
subscription as alive every month since it started: no churn, and inflated
MRR for each past month. The headline number was right, because it reads the
status. The history was wrong. A canceled row with a blank end date did the
same. All of these rows are now skipped with a reason, and so is a trial-end
date that does not parse.

## The tests that were missing

The run also seeded 20 small faults into the two tools' core maths. The test
suites caught 15. Among the five that got through: a one-cent month left out of
the journal, a rate shown as `NaN` instead of "n/a" when there was nothing to
divide by, and a sort that stopped ranking the largest customer first. Each of
the five now has a test that fails when the fault is put back, and the catch
rate on those 20 faults went from 75% to 100%.

The tools are free and MIT licensed. They give a working schedule and working
metrics for your own bookkeeping. They are not accounting, tax or audit advice.
