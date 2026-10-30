---
title: "A bank file in the wrong order no longer looks like a missing transaction"
date: 2026-10-26
description: "When a bank file's rows are neither in order nor reversed, ai-bookkeeper now searches for the one order whose running balances chain, not a missing row."
tags: [ai-bookkeeper, bank-import, testing]
---

ai-bookkeeper checks a statement's printed running balance row by row, to catch a missing, doubled or mis-signed line. It tried the file's order and its reverse. Some exports are neither: sorted by date, but with the rows inside one day running the other way. One public Schwab-style test file from the csv2ofx project, with four rows, was reported as having two broken lines when nothing was wrong.

When both orders fail, the check now looks for one order that uses every row once and chains end to end (each row's balance minus its amount equals the balance of the row before). If it finds one, the file passes and the result says it was reordered. A file with a genuinely missing or wrong row still has no such order, so it still breaks. The search is capped, so a big file full of repeated balances reports its breaks rather than guessing.

I ran the other 18 CSV samples in that project through the importer too; they read correctly. New tests use made-up rows.
