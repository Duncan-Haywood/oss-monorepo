---
title: "Schwab's checking export has note lines under the header, and our reader warned about them"
seo_title: Schwab checking export note lines, now flagged by ai-bookkeeper
date: 2026-10-27
description: "Sweeping 33 public bank-file fixtures through ai-bookkeeper's reader found one fault: Schwab's newer checking CSV was not recognised and gave false warnings."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) is tested mostly on hand-written bank files, so we keep running it over other open-source projects' test data. This time it was the test data of beancount-import (GPL, cloned at run time, read only, nothing copied): 33 bank, card, Venmo, Mint, Schwab and OFX files.

Every bank transaction in every file was counted. One file misbehaved: Schwab's current checking export has no Status column and puts two note lines ("Pending Transactions are not reflected...", "Posted Transactions") under the header. All 12 rows were read, but the format was not recognised as Schwab and the reader warned about two "short rows" that were just notes. The header is now recognised and one-cell non-date lines are skipped quietly. The fixture in the new test is made up in the same layout.

The limit is the same as before: these are other people's test files, not fresh downloads from a real account.
