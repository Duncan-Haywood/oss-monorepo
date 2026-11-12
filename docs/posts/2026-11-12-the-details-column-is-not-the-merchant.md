---
title: "The Details column is not the merchant: a bank-import fix in the expense tracker"
seo_title: "Expense tracker CSV import no longer reads Details as the vendor"
date: 2026-11-12
tags: [testing, mutation-testing, expense-tracker, csv, redteam]
description: "A red-team pass on the free expense tracker: 16 seeded faults, 11 caught, all 16 caught after five new tests, and a bank-CSV column bug fixed."
---

The [expense tracker](../../ventures/expense-tracker/) imports a bank or card
CSV by guessing which column is the date, which is the merchant and which is
the amount. It looked for the first header that contained any of a list of
names. A checking-account export laid out as

```
Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,03/04/2026,ADOBE CREATIVE CLOUD,-54.99,ACH_DEBIT,1000.00,
```

has "Details" first, and "details" was on the merchant list, so every
imported row came in with the vendor `DEBIT` and the category "Other". The
same rule let an "Account Name" column beat "Payee", and a "Last Updated"
column beat "Transaction Date".

The fix is a priority order: a header that matches a name exactly wins over
one that only contains it, and earlier names on the list win over later ones.
The old partial matching still applies when nothing matches exactly, so
"Trans. Date" and "Merchant Name" still work. A test pins all four layouts.

## What the seeded faults showed

The red-team tool seeded 16 single-line faults across two files and ran each
file's own tests against them.

- **Expense tracker invoice income, 6 of 8 caught.** The tracker reads
  [Invoice Maker](../../ventures/invoice-maker/)'s saved invoices to count
  income, and its code says it mirrors Invoice Maker's arithmetic. Nothing
  checked that. One escaped fault made an invoice whose lines net to zero
  divide 0 by 0 and report `NaN` income; the other changed rounding on a
  large negative half-cent line. The new test runs 406 invoices (six edge
  cases and 400 seeded random ones) through both tools and requires the same
  revenue, total and paid figures, so drift in either file now fails.
- **`platform/ci/wait_for.py`, 5 of 8 caught.** This is the helper agent
  sessions use to wait for long jobs. The escapes: probing a process with a
  real signal instead of signal 0 (which would hang up the job being waited
  on), a process owned by another user read as gone, the no-`/proc` fallback
  (macOS) read as gone, and the 60-second "silent" boundary. Four tests now
  cover them.

After the tests, all 16 faults are caught. Raw numbers are in the run record
under `prompts/runs/2026-11-12-session_01E5sJKksM45RMLJe23VmTkv.json`.
