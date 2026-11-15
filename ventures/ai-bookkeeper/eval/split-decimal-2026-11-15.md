# A total line with its decimal point lost (2026-11-15)

Flagship item (5), the gap left by [`total-line-gaps-2026-11-15.md`](total-line-gaps-2026-11-15.md),
which listed "mount Due $2 17" (an amount split by a space) as not tried. Engine as there:
tesseract.js 5.1.1 with `@tesseract.js-data/eng@1.0.0`, the page's four readings rebuilt with
`eval/canvas-shading.mjs` and `eval/page-readings.mjs`. This run's OCR reproduced the earlier
page figure exactly (SRD 153 of 196) before any change. No photo is committed here.

## What the misses looked like

For each of the 43 SRD photos the page got wrong, every line of its four readings that holds
the labelled amount with anything (or nothing) between dollars and cents:

| photo | line in the reading | what the reader did |
|---|---|---|
| 1112 | "TOTAL 184 47)" (readings 1, 2, 3) | no amount on the line; took another reading's guess, 143.00 |
| 1080 | "esl TOTAL : 92:22" (reading 4) | no amount; the largest amount, 84.02 |
| 1157 | "dount Due 9, 70" (reading 2) | a comma on a decimal-point receipt is not an amount; the largest amount |
| 1018 | "mount Due $2 17" (reading 3) | no amount; 8.25 |
| 1150 | "AMOUNT DUE $80 . 45" (readings 3, 4) | already joined by `cleanOcr`; lost the vote to "Total 171.00" |
| 1055 | "CASH 30. 58" | a cash line, not a total line: not touched |
| 1197 | "T0TALE € 34,00" | a euro receipt; "T0TALE" is not a total word: not touched |

So on four photos the only total line with the right amount had a space, a comma or a colon
where the point should be, and the reader saw no amount at all.

## The change (`receipts.mjs`)

`splitDecimal(line)`: on a receipt written 12.50 (not decimal-comma, not whole-unit), a total
line on which no amount reads is read again for dollars, then a space, a comma or a colon, then
exactly two digits, as the line's last number after the total word. A time ("10:45 PM"), three
digits after the gap, a line with a euro sign (its comma is the decimal point) and a line with
no total word are left alone. The total comes with a note: `total line read "184 47" with its
decimal point lost: took 184.47, check the total`. A line where an amount already reads is
never re-read.

## Results

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 153 (78.1%) | **156 (79.6%)** |
| wrong with no warning, SRD | 3 | 3 |
| SROIE OCR, 625 scans, two photo readings (psm 6, psm 4; held out) | 506 | 506 (one fixed, one broken) |
| SROIE, dataset's own text, 625 | 611 | 611 |
| CORD train / validation / test, dataset's own text | 749 / 96 / 92 | 749 / 96 / 92 |

SRD fixed: 1018, 1080, 1112, 1157 (three even-numbered photos, one odd). Broken: 1182, a slip
that prints "Total 43.60", then an included 18% tip, then "Total 50.80"; reading 3 now reads
its first total ("Total: 43 60"), which the subtotal plus tax confirm, and the vote takes it.
The label is the last printed amount, 50.80; 43.60 is the bill before the printed tip. Tax is
unchanged at 78 of 185.

Per reading, the rule fired on 14 of the 784 SRD readings and was right on 7. The 7 wrong
firings are on six photos: on four (1076, 1079, 1175, 1190) the other readings outvoted it and
the page still reads the right total (the digits themselves were misread: "Total 7 46" for
7.56, "Grand Total $96 18" on a 25.78 slip); 1122 was already wrong ("oUB TOTAL: 44 20", a
misread subtotal); 1182 is the one broken.

The rule was written looking at all 196 SRD photos, so the SRD gain is not a held-out figure.
SROIE's OCR text was not looked at while writing it; its score is the held-out check.

The CLI's `--four-pass` was not re-measured (no tesseract binary in this session); the rule is
in the same `parseReceipt` code path both use.

## Reproduce

As in [`guess-vote-2026-11-15.md`](guess-vote-2026-11-15.md), then:

```
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled --misses total
node eval/sroie-tesseractjs.mjs <clone>/data <socr> <node_modules> 4
node eval/sroie-receipts.mjs <clone>/data --ocr <socr>/psm6,<socr>/psm4
```

Before: `git stash` the change to `receipts.mjs` and score the same readings again.
Test: `receipt-crosscheck.test.mjs` ("a total line with its decimal point lost ...").

## The held-out check, in detail

SROIE OCR with the page's two photo readings (tesseract.js, psm 6 and psm 4, read fresh in
this session): 506 of 625 right before and after, the figure the last run recorded. The rule
fired on 45 of the 1,252 readings. Fixed: scan 160 (8.20 to 8.60). Broken: scan 474, "Final
Total SN 43 20" read as 43.20 where the label is 43.70 (the digit itself misread; before, a
guess happened to land on 43.70). Most firings are on Malaysian "Total (Inclusive of GST): 4,20"
lines, where the receipt's other readings already carry the total, so nothing moved. One firing is
plainly wrong: "Grand Total RM1 4, 20" (scan 538, labelled 14.20) reads as 4.20, because OCR put
a space inside "14"; the other readings outvoted it. Teaching the rule the `RM` prefix is a
possible next step but would be fitted to the held-out set, so it was not done here.
