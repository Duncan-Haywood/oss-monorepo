---
title: "Two more bank-file faults found in KMyMoney's sample files: empty descriptions and a day-first QIF read as nothing"
seo_title: "Two more bank-file faults found in KMyMoney's sample files"
date: 2026-10-27
description: "Sweeping KMyMoney's sample CSV and QIF through ai-bookkeeper found a header it did not know and a QIF whose dates it could not read."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps getting checked against files other projects wrote. KMyMoney's sample bank CSV heads its description column `Transactions`; every row imported with a blank description, so the categorizer had nothing to learn from. That header is now a description alias.

The second fault: a QIF whose only date is `30/12/2025` imported **zero rows** with "unreadable date", because QIF dates were always read month first unless the caller said otherwise. CSV files already infer day-first from the data; QIF now does too (a first number over 12 and no second over 12). Month-first files and an explicit `dayFirst` behave as before.

Both are pinned in `kmymoney-samples.test.mjs` with made-up rows in the same shape. The KMyMoney files are GPL and were read from a clone at run time, not copied.
