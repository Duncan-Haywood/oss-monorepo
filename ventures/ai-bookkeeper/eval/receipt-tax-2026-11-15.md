# Tax on receipt photos (2026-11-15)

Flagship item (5), receipts OCR. Earlier runs worked on the total: the page reads 156 of
196 SRD totals right. The tax had never been looked at. On the same photos the page read
**78 of 185 labelled taxes right (42.2%)**, with 92 left empty. Engine as in
[`split-decimal-2026-11-15.md`](split-decimal-2026-11-15.md): tesseract.js 5.1.1 with
`@tesseract.js-data/eng@1.0.0`, the page's four readings rebuilt with
`eval/canvas-shading.mjs` and `eval/page-readings.mjs`. This run's OCR gave the same
totals (156) and tax (78) as that run before any change. No photo is committed here.

## Where the 107 misses were

Each missed photo was sorted by where the labelled tax was in the four readings (a script
over the readings, not by eye):

| where the right tax was | photos |
|---|---|
| another reading's parse already had it; the page keeps the first reading's | 31 |
| in the text, but no parse read it | 33 |
| nowhere in any reading (OCR-bound) | 32 |
| (a wrong tax, other cases) | 11 |

The 33 "in the text" ones came in a few shapes:

- `Tax:: $0.70` followed by `Sbt1 w/Tax: $10.70`. The last tax-looking line won, its
  amount equalled the total, and the tax was dropped (four photos).
- `Taxes: 3.85`: `tax\b` does not match "Taxes".
- `Tax 8.75% 1.11`: the rate was read as the amount, or the line gave nothing.
- `TXTL .75`, `HI ... 4.712% GET 1.86`, `Tax 12,94`, `Total Tax 2:29`: the label or
  the amount was spelled in a way the reader did not know.

## The changes

`readTax` in `receipts.mjs` (one text):

1. Every tax line is a candidate. A rate printed beside it is removed before the amount
   is read. A line whose amount is the total or more does not count.
2. "Taxes", "TXTL" and Hawaii's "GET" are tax words. "Taxable", "w/Tax", "with tax",
   "excl." and "Tax ID" lines are not tax lines. "Tax IDR 19,635" and "Total Tax
   Included" still are (CORD caught both while this was being written).
3. A printed "Total Tax" line beats the lines it adds up. Two or more tax lines are
   added when the subtotal plus their sum is exactly the total. Otherwise the last
   line stands, as before.
4. On a receipt written 12.50, a tax line with no amount is read again for "12,94",
   "2:29" or a bare ".75", with a note asking for a check.

`voteTax` in `receipts.mjs` (several readings of one photo, `parseReceiptPasses`):

5. Each reading's tax gets one point per reading that read it, plus two when a subtotal
   from any reading plus that tax equals the settled total. A tie goes to the reading the
   total came from, then to the first.
6. A tax over 22% of the settled total is dropped (Hungary's 27% VAT is 21.3% of a total
   that includes it). This applies only across readings: on CORD's own text a misread
   single-text total would have dropped four right taxes.
7. A voted tax one digit away from the total less a subtotal is replaced by that
   difference ("Tax: 8.21" where 42.16 less 38.95 is 3.21).
8. If no reading has a tax, the total less a subtotal is used when that is under 15% of
   the subtotal. A service charge or tip pushes the gap above that.

`settleTax` in `photoocr.mjs` (the page): the receipts box is parsed again from the
settled text, so the voted tax goes into it as a `Tax 0.86` line. It replaces the first
reading's own tax line, or goes just above the total line. This is skipped when the text
would not then read that tax and the same total. The photo's status line says
`tax read as none first; kept 0.86 ...: check it`.

## Results

| SRD, 185 photos with a labelled tax | before | now |
|---|---|---|
| page (four readings, settled text) | 78 (42.2%) | **130 (70.3%)** |
| page, wrong tax | 15 | 13 |
| page, no tax | 92 | 42 |
| even-numbered photos (93) | 40 right, 8 wrong | 63 right, 8 wrong |
| odd-numbered photos (92) | 38 right, 7 wrong | 67 right, 5 wrong |

| unchanged | before | now |
|---|---|---|
| page totals, SRD 196 | 156 | 156 |
| page wrong totals with no warning | 3 | 3 |
| CORD train / validation / test tax, dataset's own text | 316 / 46 / 37 | 316 / 46 / 37 |
| CORD totals, dataset's own text | 749 / 96 / 92 | 749 / 96 / 92 |

**How independent the halves are.** The first listing of misses printed both halves, so
rules 1 to 5 were written having seen odd-numbered photos too. Rules 6 to 8 were chosen
by looking at the even half's wrong answers only. So the odd half is not a clean
held-out test. The best evidence against overfitting is that rules 1 to 4 left CORD's
404 labelled taxes, a different country and layout, exactly where they were.

SROIE was not re-read: it has no tax labels. Totals cannot change by construction:
`readTax` and `voteTax` do not touch the total, and `settleTax` refuses any edit that
would. The SRD and CORD total counts above confirm it. The CLI's `--four-pass` uses the
same `parseReceiptPasses` path and gets rules 1 to 8. It was not re-measured, since
there is no tesseract binary in this session.

## What is left

Of the 55 still missed: 28 have the amount nowhere in any reading (OCR-bound). 23 have it
in the text with no label the reader trusts ("$2.13" on an unlabelled line between
subtotal and total, "155 E" on a French TVA line). 3 have two or three tax lines where
OCR lost one of them (`Tax 1` unreadable, `Tax 2: 0.00` read). Wrong taxes: four come
from a lost second tax line (resort, liquor, beverage), three from misread digits with no
subtotal to check against.

## Reproduce

As in [`guess-vote-2026-11-15.md`](guess-vote-2026-11-15.md), then:

```
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled
for f in train validation test; do node eval/cord-receipts.mjs eval/cord/$f.jsonl; done
```

Before: `git stash` the changes to `receipts.mjs` and `photoocr.mjs` and score the same
readings again. Tests: `receipt-tax.test.mjs` (11).
