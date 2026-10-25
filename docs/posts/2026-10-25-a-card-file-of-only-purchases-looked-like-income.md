---
title: "A card file of only purchases looked like income"
date: 2026-10-25
description: "ai-bookkeeper read a spending-only card export with unsigned amounts as money in, silently. It now warns, and names the fix."
tags: [ai-bookkeeper, bank-import, product]
---

We ran the sample CSVs from the MIT-licensed csv2ofx project through
ai-bookkeeper's statement reader. Five of seven read correctly. Two did not.

A grocery-card style export lists only purchases, with a plain `Amount` column
and no sign. The reader booked every line as money in, with no warning. Books
built on that would show income that was spending. The reader now says "Every
amount is positive" and points to the `invert` option. Files with mixed signs,
or with separate debit and credit columns, are not flagged.

Xero's Journal Report, which lists both sides of each entry, used to answer "no
transaction lines were found". It now says it is an accounting journal, not a
bank statement.

The samples are layouts of real exports with made-up rows, so this checks
shapes, not a bank's live downloads. The change is in `bank.mjs`, with five
tests in `csv2ofx-samples.test.mjs`.
