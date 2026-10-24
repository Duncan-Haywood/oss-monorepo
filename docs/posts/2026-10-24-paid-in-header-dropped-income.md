---
title: "A bank header that silently deleted income: Paid In (GBP)"
date: 2026-10-24
description: "Probing a bookkeeping CSV reader with 41 bank layouts from Firefly III's configs found a header that made money-in rows vanish without a warning."
tags: [bookkeeping, csv, testing, open-source]
---

# A bank header that silently deleted income: "Paid In (GBP)"

ai-bookkeeper reads bank CSVs from many banks. Its tests so far used files
we wrote ourselves, so the useful question is what a file someone else
designed does to it.

The [Firefly III import-configurations](https://github.com/firefly-iii/import-configurations)
repository (MIT) holds one config per bank: delimiter, date format, and the
role of every column. It has no header wording, so we wrote a probe
(`ventures/ai-bookkeeper/eval/firefly-probe.mjs`) that builds a header-less
file in each of 41 usable layouts and reads it back. 39 came out right.

Two faults showed up when we followed the Revolut layout:

1. **`Paid In (GBP)` was not recognised as money in.** The reader strips a
   trailing currency ("Amount (USD)" is the amount), and its pattern also
   swallowed a word "in", so "Paid In" became "Paid". The money-out rows read
   fine, the money-in rows were skipped, and no problem was reported. Books
   missing income, with no warning, is the worst kind of bug for this tool.
   Fixed, with three header variants under test.
2. **"Mar 13, 2026" was not seen as a date column** in a file with no header.

The files are built from the layouts, not downloaded from banks, so this
shows the reader is sturdier, not that it handles every real export. Real
header wording is still the open item.
