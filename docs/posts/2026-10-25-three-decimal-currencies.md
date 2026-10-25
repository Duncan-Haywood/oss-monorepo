---
title: "A Bahraini dinar amount lost its last digit without a word"
date: 2026-10-25
description: "ai-bookkeeper read 1.234 BHD as 1.23. Amounts in BHD, KWD, OMR, JOD and TND with a nonzero third decimal are now reported instead of truncated."
tags: [ai-bookkeeper, bookkeeping, currencies]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps money in integer cents.
Five currencies (Bahraini dinar, Kuwaiti dinar, Omani rial, Jordanian dinar,
Tunisian dinar) use three decimals, so `1.234 BHD` became 1.23 and the fil
vanished with no warning on the row.

Books that quietly drop money are worse than books that refuse a row. With one
of those currency codes on the amount and a nonzero third decimal, the parser
now returns "unreadable" and the row lands in the report. `4.750 JOD` and
`12.30 KWD` still read, because nothing is lost.

This does not add true three-decimal books; that would change the ledger's unit.
It only stops the silent loss. Two tests cover it, and the whole venture suite
passes.
