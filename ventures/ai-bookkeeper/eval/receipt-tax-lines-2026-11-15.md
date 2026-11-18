# Tax on receipt photos, third pass: two and three tax lines (2026-11-15)

Flagship item (5), receipts OCR: "receipts with two or three tax lines where OCR lost one",
left open by [`receipt-tax-labels-2026-11-15.md`](receipt-tax-labels-2026-11-15.md). Same
engine and readings (tesseract.js 5.1.1, `@tesseract.js-data/eng@1.0.0`, the page's four
readings from `eval/canvas-shading.mjs` and `eval/page-readings.mjs`), rebuilt from scratch
in this session. Before any change they reproduced the earlier figures exactly: totals 156
of 196, tax 136 of 185. No photo is committed.

## The four photos named as open

| photo | label | what the four readings held |
|---|---|---|
| 1173 | 1.71 = IL Sales 1.52 + MPEA 0.15 + Restaurant 0.04 | all three amounts in every reading; only "MPEA Tax" kept the word tax; subtotal ("Net Total") unreadable |
| 1182 | 3.60 = sales 2.80 + resort 0.80 | reading 1 had both tax lines but no subtotal line; readings 2 to 4 had the subtotal, with the resort tax misread 0.60 or lost, or the sales tax read "2 80"; the receipt prints Total 43.60, then an 18% tip, then Total 50.80 |
| 1142 | 2.44 = liquor 0.60 + sales 1.84 | sales tax line unreadable in every reading (`Philly Pe Biles 12x :`); total misread: OCR-bound |
| 1198 | 12.78 = food + bev + resort | low-resolution photo; two of three tax amounts misread, two readings lost the block: OCR-bound |

## The changes (`receipts.mjs`)

1. **Tax block** (`taxBlock`, called from `readTax`). When the tax lines found don't close
   the sum, the lines touching a tax line, each with exactly one amount, none a subtotal,
   total, tip, service charge, rounding, fee, carry-out, bag or payment line, 2 to 4 lines
   in all, are added as taxes, but only when a subtotal read on the receipt, or the items
   above the block, plus their sum is exactly the total (and the sum is at most 15% of it).
   A note asks for a check.
2. **A Total printed before a tip** counts as a closing target for the subtotal plus the
   taxes (both the existing two-tax-line rule and the block), so a printed 18% gratuity
   after "Total: 43.60" no longer hides that 40.00 + 2.80 + 0.80 closes.
3. **Across readings** (`voteTax`): each reading's tax lines added (`taxSum`, kept off the
   enumerable fields) are checked against subtotals read in any reading. When the voted
   tax fails the arithmetic and exactly one such sum closes it, that sum wins.

The first version of rule 1 was scored on CORD's training split before anything else and
broke seven right taxes: Indonesian service charges (`SC (3%)`, `Ser 5%`), rounding lines
(`Pembulatan 1`, `Round 1`) and an extra fee (`BIAYA TAMBAHAN`) sit beside the tax line and
close the sum just as well. They were added to the excluded words, and a zero sum no longer
counts. On SRD the next version broke photo 1103 (`Carry Out 1.93` beside `TAX: 2.31`);
carry-out, to-go, bag, bottle deposit and surcharge lines were excluded too. The numbers
below are after both.

## Results

| SRD, 185 photos with a labelled tax (page, settled text) | before | now |
|---|---|---|
| right | 136 (73.5%) | **138 (74.6%)** |
| wrong | 11 | 9 |
| none | 38 | 38 |
| fixed / broken | | 1173, 1182 / none |
| totals right (196) | 156 | 156 |

| CORD, the dataset's own text (train / validation / test) | before | now |
|---|---|---|
| tax right | 322 / 46 / 41 | 322 / 46 / 41 |
| totals right | 749 / 96 / 92 | 749 / 96 / 92 |

**How independent this is.** Both SRD fixes are in-sample: the four photos were named as
open before the run and rules 1 to 3 were written from them. CORD is the held-out check,
and it shows only that the rules stay quiet on 1,000 other receipts (after its training
split was used to find the service-charge and rounding exclusions; validation and test
were not looked at until the end). Two photos is a small gain; the value is that the
reader now handles a shape every US hotel and many city receipts print (state plus local
or resort tax) without guessing. The CLI's `--four-pass` takes the same path and was not
re-measured (no tesseract binary here).

## What is left

1142 and 1198 are OCR-bound. Of the 38 photos with no tax read, most have the amount in no
reading or the total misread. Items still add up wrongly on 1173 ("items add to 31.26"):
the unlabelled tax lines and the Food / Beverage summary lines are counted as items, so the
split by item is refused there, which is the safe failure.

## Reproduce

As in [`receipt-tax-labels-2026-11-15.md`](receipt-tax-labels-2026-11-15.md) (the same
eight commands, about 25 minutes on 4 cores), then
`node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled`
and `for f in train validation test; do node eval/cord-receipts.mjs eval/cord/$f.jsonl; done`.
Before: `git stash` the change to `receipts.mjs`. Tests: `receipt-tax.test.mjs` (21).
