---
title: "A comma in a Zelle memo turned a $40 payment into $47 of income"
date: 2026-11-08
tags: [bookkeeping, csv, bank-of-america, testing]
description: "A real Bank of America export, 662 rows, caught our bookkeeper's reader out: its own summary block disagreed with the rows."
---

We ran [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s statement reader on a real public Bank of America checking export (662 rows, August 2023 to May 2024). Every row parsed, but the file's own summary block said credits were 15,236.58 and the rows added to 15,311.58.

The cause: when a Zelle memo contains a comma, the bank writes it as two cells, so the amount lands one column to the right. The reader took the amount from the end of the memo. A -40.30 payment became +47.00 with no warning.

The fix rejoins the split text when the amount cell is not an amount but the next cell is. The summary now matches and the file reads with no problems. A made-up-row test pins it. The check that found it, comparing a statement's summary to its rows, was added a week earlier; this is its first catch on a real file.
