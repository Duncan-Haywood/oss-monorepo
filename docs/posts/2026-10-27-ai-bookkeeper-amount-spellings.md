---
title: "Twelve ways a bank writes -4.50, and the one we checked wrong"
date: 2026-10-27
description: "ai-bookkeeper's statement reader gave the same cents for twelve amount spellings (Unicode minus, Swiss apostrophes, DR/CR suffixes, euro decimals). The one 'fault' we found was our own arithmetic."
tags: [ai-bookkeeper, bank-statements, testing]
---

Banks and spreadsheets write the same amount many ways. We probed [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s reader with twelve spellings of the same three amounts: a Unicode minus, `2'500.00`, no-break and narrow no-break space separators, a leading plus, a euro prefix, an ISO code before or after, `DR`/`CR` suffixes, `($4.50)`, and European `1.234,56`.

All twelve gave identical cents. One probe looked like a failure: Indian grouping `25,00,000.00` read as 250,000,000 cents. That is right (25 lakh is 2.5 million dollars); the mistake was ours. So no fault, and no claim of a fix.

The spellings are now pinned in `amount-spellings.test.mjs` (rows made up) so a later change to the amount parser cannot break them quietly. Still open: real exports from named banks, which only a real file can test.
