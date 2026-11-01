---
title: "We fed 40 real bank-export layouts to our bookkeeper. Six read nothing."
seo_title: "We fed 40 real bank-export layouts to our bookkeeper; six read nothing"
date: 2026-10-24
description: "ai-bookkeeper on bank2ynab's sample files: a German card export, a UK card file, a Czech codepage and a Singapore statement failed. Four fixes, with tests."
tags: [ai-bookkeeper, bank-import, testing]
---

Hand-made test fixtures only prove what we already thought of. So we took the 40 sample
files in the MIT-licensed bank2ynab project, which use real banks' column layouts, and ran
each through the `ai-bookkeeper` importer.

Most read fine. Six did not:

- **German card export.** `Buchungsbetrag` (amount) and `Transaktionsbeschreibung` were not
  known headers, so no rows came in.
- **UK card export.** The date column is `Date Processed`, and unsettled rows say `Pending`
  where a date should be. Now both are understood, and pending rows are reported as pending.
- **Singapore statement.** Each transaction is two lines, and the second has no date or
  amount. Every second line was dropped with an "unreadable date" error; it now joins the
  description above, so "DEBIT PURCHASE" becomes "DEBIT PURCHASE 15/04/18 … UBER EATS".
- **Czech export, Windows-1250.** With none of the usual giveaway letters the file decoded
  as Western text and nothing matched. The decoder now checks Czech and Polish column names
  before settling on the default.

Two single-row files are too short to infer columns from, and one pipe-delimited record file
is not a CSV; those stay unread. Four tests cover the fixes. The rows in them are invented,
only the layouts are borrowed. We still have no current export from a named bank.
