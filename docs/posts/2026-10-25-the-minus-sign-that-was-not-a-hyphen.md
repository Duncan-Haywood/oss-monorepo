---
title: "A minus sign that isn't a hyphen flipped a debit into a deposit"
date: 2026-10-25
description: "Probing ai-bookkeeper's amount parser with the dash characters that PDFs and spreadsheets produce found three that silently turned debits into credits."
tags: [ai-bookkeeper, bookkeeping, parsing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank statement amounts
with `parseCents`, which already handled brackets, trailing minus, `DR`/`CR`
and both decimal conventions. I fed it the other ways a minus gets written:
U+2212, en and em dashes, and the Unicode hyphens.

Three failed without any error. `– 5.00` (en dash, leading) read as +5.00,
and `12.50−` (U+2212, trailing) and `12.50‐` (U+2010) read as +12.50. A debit
became a deposit, which is the worst kind of parser fault because the books
still balance.

The fix is one character class, applied both before and after the number. A
lone dash of any kind is still an empty cell. `unicode-minus.test.mjs` pins
nine dash characters in both positions, plus a whole statement with en-dash
debits. The full ai-bookkeeper suite (1,193 tests) passes. These are
hand-made inputs: no bank has been confirmed to export these characters, so
this is hardening against copy-pasted and PDF-derived text, not a reported bug.
