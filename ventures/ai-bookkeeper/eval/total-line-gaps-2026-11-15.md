# Two gaps on the total line: the card line and a glued letter (2026-11-15)

Flagship item (5), the gap left by [`guess-vote-2026-11-15.md`](guess-vote-2026-11-15.md):
17 SRD photos with the right total somewhere in the page's text that still lost. Engine
as there: tesseract.js 5.1.1 with `@tesseract.js-data/eng@1.0.0`, the page's four
readings rebuilt with `eval/canvas-shading.mjs` and `eval/page-readings.mjs`. This run's
OCR reproduced the earlier page figure exactly (SRD 150 of 196) before any change. No
photo is committed here.

## What the misses looked like

Reading the page's four texts of each missed photo for the labelled amount:

| photo | where the right total was | what the reader did |
|---|---|---|
| 1177 | "Total 47.90" above "Balance Due A7 .90" (readings 3, 4); the tax misread 2.18 for 2.75 in every reading | took 7.90 from the last total line |
| 1082 | "VISA 6.56" in all four readings | no total line; took the largest amount, 19.07 |
| 1002 | "Visa 7.61" (reading 3) | no total line; largest amount |
| 1073 | "Credit Care 13.22" (reading 3) | no total line; largest amount, 556.00 |
| 1186 | "MASTERCARD ##4617 $52.47" (reading 4) | took "Total 67.50" (a printed line, still wins) |
| 1038 | "Tota 17.80" (readings 2, 4) | "Tota" is not a total word; largest amount, 20.00 |
| 1018 | "mount Due $2 17" | the amount split by a space; not tried |
| 1196 | "Total before tip: $58.30" | "tip" excludes the line; not tried |

## The changes (`receipts.mjs`)

1. **A letter glued to the total** (`gluedLookalike`). When the total line's amount has a
   letter glued in front of it that OCR makes of a digit (A for 4, G or b for 6, T for 7,
   g or q for 9; cleanOcr already maps S, B, O, l, I and Z) and nothing but that letter
   before it, the amount with the letter read as a digit is a candidate. It is taken only
   when one of the receipt's own sums (subtotal plus tax, the items, cash less change) or
   another total line gives exactly that amount and none gives the amount as read. The
   note says so and asks for a check.
2. **No total line: the card line.** Before falling back on the largest amount, the last
   line naming a card (VISA, Mastercard, MC, Amex, Discover, debit, credit, card) with an
   amount gives the total, skipping tip, change, cash-back, balance, points and savings
   lines. Not on whole-unit slips (rupiah, won): "[1] BCA DEBIT -259,000" reads as 1 there
   (CORD train-178, found by this check). The reading counts fully in the vote (it is not
   the largest-amount guess).
3. **Tried and dropped: "Tota", "TOTAI", "Tota1", "T0tal", "Iotal" as total words**
   (with "Sub Tota" and "TOTAI QTY" excluded; "TOTAI QTY 1" became a total on CORD
   train-286 until they were). It fixed SRD 1038 and broke three held-out SROIE scans
   (027, 250, 451) plus moved 194 and 026, net 503 against 506 without it: on those
   scans the clipped spelling is mostly the worse reading of a line printed twice
   ("Tota Ami Rounded 108.00" for 104.00; "GST @6% included in tota] RM 0.28").

These are reading rules, not tuned weights: nothing was fitted, so there is no even/odd
choice to report. For what it is worth, the SRD gain splits +1 on the even-numbered
photos and +2 on the odd ones.

## Results

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 150 (76.5%) | **153 (78.1%)** |
| SROIE OCR, 625 scans, the page's two photo readings (psm 6, psm 4; held out) | 505 | **506** |
| SROIE, dataset's own text, 625 | 611 | 611 |
| CORD validation, dataset's own text, 98 | 96 | 96 |
| CORD test, 95 | 92 | 92 |
| CORD train, 779 | 749 | 749 |

SRD fixed: 1002, 1073, 1082, 1177. Broken: 1134 (two readings print "Credit $21.13"
for 21.73; the old guesses happened to land on 21.73). Wrong totals with no warning stay
at 3 of 196; tax unchanged at 78 of 185. On the per-reading level the card line fired on
13 of the 784 SRD readings and was right on 10; the glued-letter repair fired on 2 and
was right on both.

SROIE OCR, held out (never looked at while writing the rules): tesseract.js on the 626
scans, psm 6 and psm 4 on the photo (not the page's full four readings, which need the
grey copies; that is why the figure is 505, not the page's 529). Fixed 228 (the card
line); 509 moved from one wrong total to another; nothing broken.

The CLI's tesseract binary was not installed in this session, so `--four-pass` was not
re-measured; the rules are the same code path.

## Reproduce

As in `guess-vote-2026-11-15.md`, then:

```
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled --misses total
node eval/cord-receipts.mjs eval/cord/train.jsonl --misses
node eval/sroie-receipts.mjs <clone>/data
node eval/sroie-tesseractjs.mjs <clone>/data <socr> <node_modules> 4
node eval/sroie-receipts.mjs <clone>/data --ocr <socr>/psm6,<socr>/psm4 --misses total
```

Before: `git stash` the change to `receipts.mjs` and score the same readings again.
