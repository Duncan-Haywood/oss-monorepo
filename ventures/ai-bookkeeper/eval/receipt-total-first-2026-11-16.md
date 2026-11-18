# Receipt tax: reading the total first (2026-11-16, later)

Flagship item (5), the "BUILDABLE HERE" note in `portfolio/flagships.yaml`: of the 41 SRD
photos with no tax from the CLI's `receipts FILE --four-pass`, 27 had the total wrong too
(`receipt-tax-ocr-labels-2026-11-16.md`). This session installed tesseract 5.3.4, fetched
the 200 photos (`eval/srd-fetch.mjs`) and re-read them with `eval/srd-cli.mjs` (4 shards,
about 40 minutes). The baseline reproduced the last run's figures exactly (totals 151,
tax 132 / 12 wrong / 41 none).

## What the 26 "no tax, wrong total" photos looked like

(1087 has no labelled total, so it is not counted here: 26, not 27.)

| photo | what the four readings hold | fixable from the text? |
|---|---|---|
| 1133 | subtotal 134.46 + tax 12.11 in two readings; "STOTAL"/"SOSTOTAL: 146.57" in two; "A TOTAL: 12.11" in one | **yes**: subtotal plus tax printed (rule 1) |
| 1030 | "TOTAL: 04.78" in one, "TOTAL: $94.78" in another; no tax amount anywhere ("Tax 12") | total only (rule 2) |
| 1022 | one reading's guess 37.37 with tax 3.01; another "TOTAL: 7.07", "CASH: 100,00", "CHANGE 62.63" | not without reading "100,00" as 100.00 on a dot receipt |
| 1006 | "Total: $9358" (decimal lost, no gap) and "Total: $93,48" | no: the reading has no other amount with cents to check against |
| 1169 | "Total - 6.39" over "PBalance Bue 46.39"; subtotal misread "Bibtote!" | total maybe ("Bue" for "Due"); no tax line |
| 1073 | "Sh Tote 11.99", "sales Tax (10.25%) 1.2", "Amount; $13.72" (13.22) | maybe: 11.99 at 10.25% is 13.22, one digit from 13.72; one photo, left |
| 1067, 1172, 1191 | subtotal read; total never printed in any reading ("Visa $29.5", "Order Tota! A Raa") | no: the total is not on the page |
| 1104 | food and bar subtotals 37.90 + 14.00; no total, no tax | no |
| 1142 | subtotal misread 31.00 / 21 00 (81.00), liquor tax 0.66 (one of two taxes) | no |
| 1035 | "Total: 26.8" / "20.8" cut off | no |
| 1189 | "Total © =©927.08" (27.08) | maybe: a glued "9"; one photo, left |
| 1003, 1019, 1026, 1039, 1041, 1053, 1056, 1063, 1093, 1095, 1111, 1156, 1181 | no total or tax line in any reading, or no label total | OCR-bound |

Photo 1002 (tax right, total wrong) was fixed by rule 1 as well: its subtotal 6.98 plus
tax 0.63 is 7.61, printed on the card line ("Visa 7.61") of the reading whose total line
read "Total 1.61".

## Results

| SRD, CLI `--four-pass` | before | after |
|---|---|---|
| totals right (196) | 151 | **154** |
| tax right (185) | 132 | **133** |
| tax wrong / none | 12 / 41 | 12 / 40 |
| item splits kept (200) | 49 | 49 |

Gains: 1002, 1030, 1133. None lost. In-sample: the rules were written from these photos.
CORD and SROIE (dataset text, one reading) never run the vote, so they are unchanged and
do not test it. Dropped: a reading whose own cash less change disagrees with its total
line losing its total-line point (no photo changed).

## Left for the next run

- A held-out multi-reading set: CORD's photos through tesseract (`eval/cord_images.py`)
  would test the vote on receipts never looked at.
- The page's readings (tesseract.js, `eval/receipt-tax-labels-2026-11-15.md`): rebuild and
  re-measure the page's totals, tax and item splits with both 2026-11-16 changes.
- 1022: a cash line read "100,00" on a dot-style receipt. 1073: subtotal times the printed
  rate one digit from an "Amount" line. Each is a single photo.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
node eval/srd-fetch.mjs $P
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4
```

Before: `git stash` the change to `receipts.mjs`.
