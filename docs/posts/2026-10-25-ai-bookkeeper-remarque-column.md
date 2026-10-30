---
title: "A French bank export that imported with blank descriptions"
date: 2026-10-25
description: "Sweeping hledger's example CSVs through ai-bookkeeper found a 'Remarque' note column that was not recognised as the description."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads bank CSVs from dozens of banks. Running 16 example exports from the hledger project (cloned at run time, read only) through the reader found one fault: a French file with the columns `Date, Remarque, Montant` imported every row with an **empty description**, in UTF-8, Windows-1252 and ISO-8859-1 alike. Amounts and dates were right, but with no payee the categorizer had nothing to work with.

`Remarque`, `Bemerkung` and `Opmerking` (French, German and Dutch for "note") are now description headers, pinned by `remarque.test.mjs`. Bank of Ireland, Monefy, YNAB4, PayPal and Stripe samples read clean. The older Coinbase layout (crypto units, no fiat total) still reads zero rows without explaining why; that is logged in the README as open.
