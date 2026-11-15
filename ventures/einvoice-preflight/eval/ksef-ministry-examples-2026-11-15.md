# FA(3) totals on the Ministry's 26 published examples (2026-11-15)

**Source.** The Polish Ministry of Finance publishes 26 example FA(3) invoices with a PDF describing
each ("Przykładowe pliki dla struktury logicznej e-Faktury FA(3)", ksef.podatki.gov.pl, "Pliki do
pobrania", zip sha256 prefix 41ebd3c57144951c). They cover every `RodzajFaktury`: VAT (12), KOR (5), KOR_ZAL (3),
ROZ (2), UPR (2), ZAL (1) and KOR_ROZ (1). Earlier runs measured `fa3.mjs` on the 14 client templates
in the Ministry's GitHub repositories, which hold no correction, advance or settlement file; this zip
is the first set that does. The files are not copied into the repository; the eval downloads them.

**Command.** `node eval/ksef-ministry-examples.mjs <unzipped folder>` runs `checkFa3` on each file, then
seeds two faults into every P_13_n, P_14_n and P_15 the file states (+0.03 and +1.00, one at a time):
a fault is caught when a totals rule (PL-006, PL-007, PL-008, PL-023) fires that did not fire on the
original.

## Before (main at da90f8977)

| | Result |
|---|---|
| Blocking findings on the Ministry's own files | **6** (all false: see below) |
| Seeded total faults caught | **78 of 166** |
| KOR, KOR_ZAL, KOR_ROZ, ZAL, ROZ files whose sums were checked | 0 of 12 (skipped by design) |

The six false findings, each a fault in this checker, not in the Ministry's file:

- **Example 1 (VAT), PL-008:** P_15 2051 against totals of 2050.99. A one-grosz gap from pricing in gross
  (the net 1,666.66 is derived from 2,050.00 gross) that the code meant to allow, but `Math.abs(a - b) > 0.01`
  in floating point is true for 2051 - 2050.99. All amount comparisons now count whole grosze.
- **Example 15 (UPR), PL-006:** a simplified invoice whose line names the goods and nothing else; the
  "total with no line at that rate" check assumed every line states a rate.
- **Example 16 (UPR), PL-008:** a simplified invoice with P_15 and no P_13/P_14 at all, which the Ministry
  describes as allowed when the invoice has one rate (tax = P_15 - P_15 x 100/123).
- **Examples 2 (KOR) and 18 (KOR_ROZ), PL-009 x 3:** a correction shows a changed line twice, before
  (`StanPrzed`) and after, and the Ministry gives both rows the same `NrWierszaFa` (though its PDF says
  "odrębną numeracją"). Line numbers are now unique within each side.

## What the Ministry's files say about the arithmetic

Read from the XSD's notes on P_13_1, P_14_1 and P_15 and checked to the grosz on the files:

- **KOR:** each P_13_n is the lines' P_11 at that rate, with `StanPrzed` rows counting minus
  (example 2: 1,463.41 - 1,626.01 = -162.60). A correction by difference (example 3) is the same sum.
  A period discount (examples 6, 7) has no amounts in its lines; its totals are only checked against P_15.
- **ZAL:** the payment P_15 is split across the order's rates in proportion to each rate's gross
  (`P_11NettoZ + P_11VatZ`), rounded to the grosz; tax = share x rate / (100 + rate), rounded; net = the
  rest (art. 106f ust. 1 pkt 3). Example 10: 20,000 at 23% gives 16,260.16 + 3,739.84.
- **ROZ:** the same split of the remainder P_15, by the gross of the lines (example 14: 307,635 over
  307,500 at 8% and 4,500 at 23% gives 280,177.59 / 22,414.21 and 4,100.16 / 943.04). Example 17,
  which the Ministry labels as wrongly issued (300,000 instead of 307,635), is internally consistent:
  its fault is the amount received, which the file cannot show.
- **KOR_ZAL, KOR_ROZ:** the split of P_15ZK + P_15 over the after rows minus the split of P_15ZK over the
  `StanPrzed(Z)` rows (example 11: a line moved from 23% to 8% with the advance unchanged gives
  -15,993.60 / -3,678.53 and +18,214.94 / +1,457.19, P_15 = 0; example 12: the advance raised from
  20,000 to 30,000; example 13: both rates cut in proportion, so no change; example 18).

Every one of these reproduces the Ministry's stated P_13_n and P_14_n exactly (the check allows 2 grosze,
for the two or four roundings).

## After

| Example | RodzajFaktury | Findings (blocking) | Notes | Skipped | Seeded faults caught |
|---|---|---|---|---|---|
| 1 | VAT | none |  |  | 10 of 10 |
| 2 | KOR | none |  |  | 6 of 6 |
| 3 | KOR | none |  |  | 6 of 6 |
| 4 | VAT | none |  | line amount = quantity x unit price (a line discount, P_10, is present) | 6 of 6 |
| 5 | KOR | none |  | P_13_n against lines (a correction with no lines, such as a discount on a period's supplies) | 2 of 2 |
| 6 | KOR | none |  | P_13_n against lines (a correction with no lines, such as a discount on a period's supplies) | 6 of 6 |
| 7 | KOR | none |  | P_13_n against lines (not every line states both P_11 and a rate, P_12) | 6 of 6 |
| 8 | VAT | none |  | P_13_n against lines (a line states a gross value, P_11A) | 4 of 4 |
| 9 | VAT | none |  |  | 8 of 8 |
| 10 | ZAL | none |  |  | 6 of 6 |
| 11 | KOR_ZAL | none |  |  | 10 of 10 |
| 12 | KOR_ZAL | none |  |  | 10 of 10 |
| 13 | KOR_ZAL | none |  |  | 2 of 2 |
| 14 | ROZ | none |  |  | 10 of 10 |
| 15 | UPR | none |  | P_13_n against lines (not every line states both P_11 and a rate, P_12) | 6 of 6 |
| 16 | UPR | none |  | P_13_n against lines (not every line states both P_11 and a rate, P_12); P_15 against the totals (a simplified invoice, UPR, that states no P_13_n or P_14_n: the tax is read from the single rate, as the Ministry's example 16 allows) | 0 of 2 |
| 17 | ROZ | none |  |  | 10 of 10 |
| 18 | KOR_ROZ | none |  |  | 10 of 10 |
| 19 | VAT | none |  | P_13_n against lines (a line states a gross value, P_11A) | 8 of 8 |
| 20 | VAT | none |  |  | 6 of 6 |
| 21 | VAT | none |  |  | 6 of 6 |
| 22 | VAT | none |  |  | 4 of 4 |
| 23 | VAT | none |  |  | 4 of 4 |
| 24 | VAT | none | PL-020 |  | 6 of 6 |
| 25 | VAT | none | PL-020 |  | 6 of 6 |
| 26 | VAT | none |  |  | 6 of 6 |

| RodzajFaktury | Files | Seeded faults | Caught |
|---|---|---|---|
| KOR | 5 | 26 | 26 |
| KOR_ROZ | 1 | 10 | 10 |
| KOR_ZAL | 3 | 22 | 22 |
| ROZ | 2 | 20 | 20 |
| UPR | 2 | 8 | 6 |
| VAT | 12 | 74 | 74 |
| ZAL | 1 | 6 | 6 |
| all | 26 | 166 | 164 |

Blocking findings on the Ministry's own files: 0

The two faults still missed are on example 16 (P_15 alone on a simplified invoice): there is nothing
to add it up against.

## Limits

- These are the Ministry's teaching examples, not invoices a business sent; still no real KSeF rejection.
- The split rule is read from the Ministry's files and the XSD notes; KSeF itself does not check
  arithmetic on receipt (its "Weryfikacja faktury" list has no sum checks), so a wrong split is
  accepted by KSeF and becomes a wrong VAT record. These findings are for the issuer and their accountant.
- A correction of an advance or settlement shown by difference (no before rows) is skipped and named;
  so is one without P_15ZK.
- Margin (P_13_11), taxi lump-sum (P_13_4) and OSS (P_13_5) rows are not placed in the split; a file that
  has them is skipped.
