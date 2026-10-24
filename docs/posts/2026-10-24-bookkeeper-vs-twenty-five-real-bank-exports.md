---
title: "We ran 25 CSV exports someone else wrote through our bookkeeper"
date: 2026-10-24
description: "csv2ofx's test files, run through the ai-bookkeeper CLI: 23 of 25 read, Amazon's order history needed a fix, and a Xero journal report is correctly not a bank statement."
tags: [ai-bookkeeper, testing, csv]
---

# We ran 25 CSV exports someone else wrote through our bookkeeper

Most of ai-bookkeeper's bank readers were tested on files we wrote
ourselves, which only proves they read what we expected. So we cloned
[csv2ofx](https://github.com/reubano/csv2ofx) (MIT) and imported all 25 files
in its `data/test` folder with `cli.mjs import`.

- **23 read**, including Schwab, Capital One, N26, UBS, Payoneer,
  Outbank, GLS (day-first dates and decimal commas inferred) and Stripe. Where
  the file carries a running balance, the reconcile check agreed on every file
  except one csv2ofx built to break it (Schwab case 2), where it flagged the
  break at line 3.
- **Amazon's order-history report read nothing.** It has no amount header,
  only `total`. Fixed in `bank.mjs`: with an `order id` column, `total` is the
  amount and `items` the memo; pending orders are skipped with a warning.
- **A repeated header row** in one of those Mint files is skipped with a warning, which is
  the right call.
- **The Xero file is a journal report**, two sides per entry, not a bank
  statement. We left it unread rather than double count; the QuickBooks/Xero
  migration command is the right door for it.

Only layouts were reused; the new test's rows are made up. Full suite result is
in the PR.
