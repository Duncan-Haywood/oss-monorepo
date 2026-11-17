# Tax on receipt photos, second pass: misread labels and arithmetic (2026-11-15)

Flagship item (5), receipts OCR. Follows [`receipt-tax-2026-11-15.md`](receipt-tax-2026-11-15.md),
which took the page from 78 to 130 of 185 labelled SRD taxes. Same engine and readings
(tesseract.js 5.1.1, `@tesseract.js-data/eng@1.0.0`, four page readings from
`eval/canvas-shading.mjs` and `eval/page-readings.mjs`). This run rebuilt the readings from
scratch and got the earlier run's numbers exactly before any change: totals 156 of 196, tax
130 of 185 (13 wrong, 42 none). No photo is committed.

## What the 55 misses looked like

Listed per photo with every line in each of the four readings that mentions tax, subtotal
or total, or holds the labelled amount. Most are OCR-bound (the amount is in no reading, or
the total itself is misread). The readable ones came in five shapes:

| shape | photos | example |
|---|---|---|
| "Tax" with its first letter misread | 1149, 1172, (1095) | `[ax 0.30`, `fax 1: 1.36`, `flax 1: 0.46` |
| an unlabelled or garbled-label amount that closes subtotal to total | 1131 | `TAXABLE SALES $25.85`, `Go's THY $2.46`, total 28.31 |
| a zero second tax line read last | 1154 | `Tax 1: 6.35`, `Tax 2: 0.00` |
| `Sub/Ttl` not read as a subtotal | 1083 (1028) | `Sub/Tt] 12.67`, `Tax 8.75% 1.1` |
| the amount column shifted up a line | 1105 | `Subtotal`, `Tax $21.50`, `$1.37`, `Total` |

## The changes (`receipts.mjs`)

1. `readTax`: a zero tax line is dropped when a non-zero one exists ("Tax 2: 0.00" is a tax
   that does not apply). A lone 0.00 tax line still reads as 0.
2. `SUB_RE`: `Sub/Ttl` (and OCR's `Sub/Tt]`, `Sub/Tt1`) is a subtotal.
3. `readTax`, only when no line reads as a tax line and the total is known: between the
   last subtotal (or "Taxable Sales") line and the total line, a line whose label is a
   misread "Tax" (`[ax`, `fax`, `lax`, `flax`, `Bax`; a cents-shaped amount; not a phone
   number) is the tax; otherwise a line with one amount that the subtotal makes exactly
   the total is. Either must be at most 15% of the subtotal. The "1" in "Tax 1:" is not
   read as an amount. Each adds a note asking for a check.
4. `readTax`: a single tax line whose amount is half the total or more, followed by a bare
   amount, the two adding to the total: the tax line holds the subtotal and the line
   below is the tax.
5. `voteTax`: when two subtotals one digit apart make two candidate differences
   (`$28.48` in three readings, `$28.47` in one), the subtotal more readings read decides
   which difference repairs a one-digit-off tax.

## Results

| SRD, 185 photos with a labelled tax (page, settled text) | before | now |
|---|---|---|
| right | 130 (70.3%) | **136 (73.5%)** |
| wrong | 13 | 11 |
| none | 42 | 38 |
| fixed / broken | | 1083, 1105, 1131, 1149, 1154, 1172 / none |

| CORD, the dataset's own text (train / validation / test) | before | now |
|---|---|---|
| tax right | 316 / 46 / 37 | **322 / 46 / 41** |
| tax wrong | 6 / 0 / 1 | 7 / 0 / 0 |
| totals right | 749 / 96 / 92 | 749 / 96 / 92 |

CORD was not looked at while writing rules 1 to 5, so its ten fixes are held out. They are
Indonesian lines that read as no tax line: `PB-1 10% 2.818`, `P Resto 10% 3.273`,
`F.Rest 10 % 2,636` (restaurant tax, "pajak restoran"), `PJR 4,909`, `AMOUNT 818` and a
bare `1,363`, each between the subtotal and the total and closing them exactly (rule 3), and
test-99, where a `0` tax line replaced the real one (rule 1). The one new "wrong" on train,
train-495, is a label quirk: the dataset's tax field is `10.000%,546`, and the receipt's
tax is 546, which is what is now read.

During the run rule 3 first read `fax 1: 3.5` on photo 1122 as 1.00 (the line number) and
broke a right tax; stripping the "Tax N:" index and requiring a cents-shaped amount fixed
it before the numbers above. Totals cannot move: `readTax` and `voteTax` run after the
total, and `settleTax` refuses any edit that changes it (SRD 156, CORD unchanged).

**How independent this is.** Rules 1 to 5 were written looking at all 55 SRD misses, so the
SRD gain is in-sample. CORD is the held-out check, a different country and layout. SROIE has
no tax labels and was not re-read. The CLI's `--four-pass` takes the same path and was not
re-measured (no tesseract binary here).

## What is left

38 photos read no tax and 11 a wrong one. Of the 49, most have the amount in no reading
or the total misread, so the arithmetic has nothing to check against (1035's `$2.13` and
1191's `$2.53` are the right tax on an unlabelled line, but their totals read `fo.%` and
`255`). Lost second and third tax lines (1142, 1173, 1182, 1198) are still open, and 1095's
`flax 1: 0.46` is read in one reading but outvoted.

## Reproduce

As in [`receipt-tax-2026-11-15.md`](receipt-tax-2026-11-15.md):

```
node eval/srd-fetch.mjs <photos>
node eval/srd-canvas-grow.mjs <photos> <grey>
node eval/canvas-shading.mjs <photos> <shading.json>
node eval/sroie-tesseractjs.mjs <photos> <ocr> <node_modules>      # and <grey> <ocr2>
node eval/sroie-tesseractjs.mjs <photos> <ocrS> <node_modules> 4 --modes psm6 --set thresholding_method=2   # and <grey> <ocr2S>
node eval/page-readings.mjs <shading.json> <ocr> <ocr2> <ocrS> <ocr2S> <page>
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled
for f in train validation test; do node eval/cord-receipts.mjs eval/cord/$f.jsonl; done
```

The four tesseract.js passes took about 141 s each on 4 cores, two at a time. Before: `git
stash` the change to `receipts.mjs` and score the same readings. Tests:
`receipt-tax.test.mjs` (17).
