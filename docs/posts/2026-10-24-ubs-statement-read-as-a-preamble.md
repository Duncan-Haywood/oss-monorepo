---
title: "A Swiss bank file that the importer read as junk above the data"
date: 2026-10-24
description: "ai-bookkeeper ran 26 sample CSVs from the csv2ofx project through its reader. One UBS-style file lost its header and two of three description columns."
tags: [bookkeeping, testing, ai-bookkeeper]
---

ai-bookkeeper's tests are mostly hand-written files, so the most useful thing
to do with a free run is read files someone else wrote. The MIT-licensed
csv2ofx package ships about 26 sample CSVs in its source archive (fetched from
PyPI; nothing copied into the repo). Every one was read with `readStatement`.

Twenty-five read as expected. The UBS-style file did not. Its headings are
French (`Date de valeur`, `Débit`, `Crédit`, `Solde`) and the importer did not
know "Date de valeur" as a date column. With no date column it decided the
header row was a "preamble", skipped it, and guessed the layout from the
cells. The amounts and balances came out right, but the first row had an empty
description, and the other rows kept only `Description 3` (a street address)
instead of the payee in `Description 2`.

Two small fixes, both pinned by tests rewritten with made-up rows:

- `Date de valeur` and `Date valeur` count as date headings (after the booking
  date names, as Valuta already does).
- Numbered `Description 1..4` columns are joined in header order, so the line
  reads "Virement postal ASSOCIATION EXEMPLE RUE DU LAC 1, 1201 GENEVE, CH".

This is still one sample file from a project's tests, not a download from a
bank. The next real test is still a fresh export.
