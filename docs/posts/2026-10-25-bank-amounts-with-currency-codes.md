---
title: "Bank amounts with a currency code after the sign"
description: "The ai-bookkeeper amount reader now treats 12.50-USD and 12.50 USD DR as debits instead of income."
date: 2026-10-25
tags: [ai-bookkeeper, bank-import]
---

Some bank exports write a debit as `12.50-USD` or `12.50 USD DR`. The ai-bookkeeper amount reader took the first as income and the second as income too, because it only looked for the minus or DR marker at the very end of the cell. It now accepts a three-letter currency code after a trailing minus, and between the number and a DR/DB marker. Plain `12.50 USD` and `12.50 USD CR` stay positive. Tests are in `ventures/ai-bookkeeper/debit-prefix.test.mjs`; the 97 neighbouring bank-reader tests still pass. These shapes come from the formats' descriptions, not from a real export, so a real file using them is still wanted.
