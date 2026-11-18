# CORD tax labels the scorer misread (2026-11-18)

Two runs (doc friction 2026-11-16 and 2026-11-17) needed the receipts whose **tax** was
missed and found that `eval/cord-receipts.mjs --misses` lists only total misses. So
`--tax-misses` now lists them (and `score()` returns `taxMisses`): each receipt whose labelled
tax was read wrong or not at all, or where a tax was read but none is labelled, with the tax line
the parser took.

The first list it printed showed three "wrong" train taxes that the parser had right:

| Receipt | CORD `tax_price` | Scored as, before | Parser read |
|---|---|---|---|
| train-421 | `10% 4,818` | 104,818 | `Pb1 10% 4,818` -> 4,818 |
| train-435 | `Pb1 10% 7,000` | 1,107,000 | `Pb1 10% 7,000` -> 7,000 |
| train-495 | `["10.000%", "546"]` | 10,000,546 | `AMOUNT 546` -> 546 |

`labelCents` kept every digit of the label, so a rate written into it (or a list of a rate and
an amount, joined into one string) became one glued number. Now a rate (`10%`, `10.000%`) and a
tax code glued to a digit (`Pb1`) are dropped before reading, and a list of tax labels is the sum
of its entries (`taxLabelCents`; CORD lists one entry per tax line). Across all 1,000 receipts
the new reading changes exactly these labels: every other total, subtotal and tax label reads the
same value as before (checked by comparing the two functions on every label; space-grouped
`154 000` and `Rp.118.000` still read as before).

Scores (`node eval/cord-receipts.mjs eval/cord/<split>.jsonl`), parser unchanged:

| Split | Tax right, before | Tax right, after |
|---|---|---|
| train | 325 of 352 | **328 of 352** |
| validation | 46 of 47 | 46 of 47 |
| test | 41 of 41 | 41 of 41 |

Totals unchanged on every split. The photo evals that import `labelCents` read the same fix
(`receipt-version-diff.mjs` now uses `taxLabelCents` for the tax).

What `--tax-misses` leaves on train, 24 receipts:

- 22 labelled taxes read as none (e.g. train-1, train-6, train-82): the next development set.
- train-744 and train-778: two tax lines, `9,817.8` and a `PAJAK 0% 0` line; the parser took the
  0% line. A real parser miss.
- train-191: `["30.273 200", "3.027"]`, the label noise the CORD README already names; left in.
- Read where none is labelled: train-290 (`Pajak Resto 9,818`) and train-592 (`PB 1 4,955`), both
  look like real tax lines CORD did not label; left in the count, not removed.
