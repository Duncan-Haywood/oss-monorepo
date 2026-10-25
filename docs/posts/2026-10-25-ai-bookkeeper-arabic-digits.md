---
title: "Bank exports in Arabic-Indic digits used to read as NaN"
date: 2026-10-25
description: "ai-bookkeeper now reads amounts and dates in Arabic-Indic, Persian and fullwidth digits, which Gulf, Iranian and some East Asian bank statements use."
tags: [ai-bookkeeper, bank-import, i18n]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank exports in many
layouts. Probing `parseCents` with odd inputs showed one clear gap: an amount
like `١٢٣٫٤٥` (Arabic-Indic digits, Arabic decimal mark) came back `NaN`, and a
date like `٢٠٢٦-٠٣-١٢` came back `null`, so those rows were dropped or flagged.

The fix is one small function, `asciiDigits`, that maps Arabic-Indic
(U+0660), Persian (U+06F0) and fullwidth (U+FF10) digits plus the Arabic
decimal and thousands marks to ASCII before parsing. ASCII input passes through
unchanged. `arabic-digits.test.mjs` covers amounts (negatives, parentheses,
thousands) and dates (ISO, day-first).

What is not measured: this is checked on hand-written strings, not on a real
export from a bank that prints native digits. A real one is still wanted.
