---
title: "Bank CSV headers that say \"Amount in EUR\""
date: 2026-10-24
---

Probing ai-bookkeeper's importer with realistic exports turned up one miss:
a header like `Amount in EUR`, `Amount, EUR` or `Betrag in EUR` was not
recognised as the amount column. Files with several rows still parsed, by
luck, through the headerless fallback. A one-row file failed with "No
transaction lines were found". The currency-suffix rule in `detectColumns` now
accepts "in" and comma/dash separators, with tests for five spellings.
Amex, Chase, Wise, PayPal, tab-separated and parenthesised/CR/DR amounts
were probed in the same pass and already worked.
