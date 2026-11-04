---
title: "Two totals lines and a comma made a bank file unreadable"
date: 2026-11-04
description: "Probing ai-bookkeeper with the real preamble and footer shapes of 81 bank exports found a delimiter bug that returned zero rows."
tags: [ai-bookkeeper, csv, testing]
---

# Two totals lines and a comma made a bank file unreadable

A public config from the bank2ynab project records, for 117 banks, how many
junk lines sit above and below the table, the delimiter, the date format and the
column order. It does not record the header wording.

So I built a file for each of 81 layouts with that skeleton: made-up rows, a
neutral header, a preamble and a footer. ai-bookkeeper read 78 right. The other
three were semicolon files with decimal commas and two or more footer lines such
as `Total debits;1,000.00`.

The delimiter picker counted lines by how many fields each splits into. Every
decimal amount and every totals line split into two fields on the comma. Five of
those outvoted the four real table lines, comma won, and the reader returned no
rows. Scoring by lines times (fields minus one) fixes it: 81 of 81 now read, and
the 2,232 existing tests still pass.

Caveats: the rows and headers are made up, so this shows the structure is
handled, not that any bank's real file reads. The probe is
`ventures/ai-bookkeeper/eval/bank2ynab-preamble-probe.mjs`.
