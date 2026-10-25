---
title: "A brokerage export that read as nothing, and then as spending"
date: 2026-10-25
description: "Sweeping three open-source projects' test files through ai-bookkeeper's statement reader found one silent failure: Schwab's brokerage Transactions CSV."
tags: [ai-bookkeeper, bookkeeping, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank exports, and its
readers had mostly been checked against files we wrote ourselves. This run
pushed every CSV, OFX and QIF sample from three open-source accounting
importers (beancount-import, beangulp, ledger-autosync) through the reader and
looked at what came back empty.

Most empties were right: stock positions, balance snapshots and investment-only
OFX files, each refused with a reason. One was not. Schwab's brokerage
"Transactions" export read as zero rows with no message. Given rows, it booked
a share purchase as spending, flagged its own "Transactions Total" line as an
unreadable date, and warned that every amount was positive.

The reader now recognises that layout, leaves buys and sells out with a count
(they move value between cash and securities), skips the totals row, and says
so when a period is empty. The sample file has no rows, so the rows in the test
are made up; a real export with activity is still wanted.
