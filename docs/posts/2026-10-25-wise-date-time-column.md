---
title: "A Wise statement booked March 6 as June 3"
date: 2026-10-25
description: "ai-bookkeeper now recognises Wise's newer statement CSV, which adds a Date Time column, and reads its dates day first."
tags: [ai-bookkeeper, wise, csv]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) knew Wise's statement layout
(`TransferWise ID, Date, Amount, ...`) and read its dates day first. Wise's
newer export puts a `Date Time` column between `Date` and `Amount`, so the
layout match failed, the file fell back to generic sniffing and `06-03-2024`
was read as June 3 instead of March 6.

The match now allows the extra column, and `wise.test.mjs` covers both
layouts (there was no Wise test before). The header is from memory and the
rows are made up, so a real export is still wanted. The same check showed
Kraken's `ledgers.csv` imports nothing; that is the next reader to write.
