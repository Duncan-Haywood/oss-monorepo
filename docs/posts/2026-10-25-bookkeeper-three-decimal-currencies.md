---
title: "Kuwaiti dinars have three decimals; our ledger keeps two"
date: 2026-10-25
description: "ai-bookkeeper used to round 1.234 KWD to 1.23 without a word. It now warns on every such line."
tags: [ai-bookkeeper, bank-import, currencies]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps money as integer hundredths.
Seven currencies (BHD, KWD, OMR, JOD, TND, IQD, LYD) divide into thousandths, so a
statement line of `-1.234 KWD` was booked as 1.23 with no mention of the lost digit.

The statement reader now warns on each line of such a currency whose amount has a
non-zero third decimal, and keeps the row. It does not model thousandths: books
for these currencies still lose that digit, but now you are told which lines.
Tested on two made-up fixtures; no real Gulf bank export was tried.
