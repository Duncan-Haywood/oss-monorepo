# The CLI's `--four-pass` re-measured; item splits under the total (2026-11-16)

Flagship item (5), the "BUILDABLE HERE" note in `portfolio/flagships.yaml`: the CLI's
`receipts FILE --four-pass` had not been re-measured since the tax work of 2026-11-15
(three runs that day had no tesseract binary). This session installed it
(`apt-get install -y tesseract-ocr`: tesseract 5.3.4, ImageMagick already present),
fetched the 200 SRD photos (`eval/srd-fetch.mjs`, pinned commit, none committed) and read
each one the way the CLI does (`eval/srd-cli.mjs`, four shards on 4 cores, about 25
minutes with `OMP_THREAD_LIMIT=1`).

## 1. The CLI as it stood (before this run's change)

| SRD, CLI `--four-pass` | last measured | now |
|---|---|---|
| totals right (196) | 147 (75.0%), guess-vote run | **150 (76.5%)** |
| tax right (185 with a labelled tax) | never measured | **126 (68.1%)** |
| tax wrong / none | | 14 / 45 |
| tax read where none labelled | | 1 |
| item split kept (200) | never measured | 42 |

The three totals gained since the last reading come from the card-line, glued-letter and
split-decimal rules (README, 2026-11-15), which were only measured on the page. The page's
tax figure is 138 of 185 (74.6%, `receipt-tax-lines-2026-11-15.md`). The CLI reads 12
fewer, with 45 photos reading no tax against the page's 38. The tesseract binary and
tesseract.js read differently, and the CLI's readings are not the page's (no canvas
shading step; see README "Full-size photos").

The CLI's tax misses, for the next run:

- wrong (14): 1000 (4.68 read 0.68), 1028 (2.97 / 2.87), 1058 (1.10 / 1.19), 1061 (2.29 /
  2.25), 1084 (8.24 / 0.60), 1112 (12.87 / 10.04), 1126 (1.80 / 0.80), 1153 (23.49 / 83.49),
  1171 (24.60 / 24.80), 1177 (2.75 / 2.15), 1178 (0.91 / 0.31), 1182 (3.60 / 2.80), 1184
  (15.35 / 17.35), 1198 (12.78 / 2.24). Most are a single digit misread on the tax line.
- none (45): 1003, 1006, 1009, 1012, 1013, 1018, 1019, 1022, 1026, 1030, 1032, 1034, 1035,
  1039, 1041, 1044, 1053, 1055, 1056, 1063, 1064, 1067, 1070, 1073, 1076, 1087, 1093, 1095,
  1104, 1111, 1114, 1133, 1134, 1142, 1156, 1159, 1162, 1169, 1172, 1180, 1181, 1189, 1191,
  1192, 1199.

## 2. Photo 1173's item split, and what else it was blocking

The open note said photo 1173 "counts its unlabelled tax and Food / Beverage summary lines
as items, so its item split is refused". The CLI's reading shows both:

```
1 Add Carnitas Taco $4.95
...
Net Total: $1485
IL Sales $1.52
MPEA Tax $0.15
Restaurant $0.04
TOTAL: $16.56
Food: $12.40
Beverage: $2.45
```

The five items are 14.85. The reader added "IL Sales" and "Restaurant" as items (they were
already counted as taxes by the tax block), then the Food and Beverage summary printed
under the total: "items add to 29.70".

Changes (`receipts.mjs`):

1. **Lines taken as taxes are not items.** `taxBlock` returns the lines it added and
   `parseReceipt` leaves them out of `parseItems`.
2. **Items above the first subtotal or total line, as a retry.** When every line fails the
   check, the item lines above the first subtotal line (or first total line with an amount)
   are tried alone. They are kept only if they close the total exactly with the tax and
   tip, as the full list must.
3. **Not against a guessed total.** The retry runs only when the total came from a total
   line at or below that point. SRD photo 1160 has no total line read, and the largest
   amount the reader fell back on (31.45) is the food subtotal itself, so the three items
   "closed" it. The first version kept that split. This guard drops it, and a test pins it.
4. **"Subtota" is not an item.** OCR's `Subtota | 6.25` and `Subtota] 74.70` were taken as
   items (SRD 1060 kept a split of "Subtota]" plus a surcharge in the first version).

## 3. Results

| item split kept | before | after |
|---|---|---|
| SRD, CLI `--four-pass` (200) | 42 | **48** (+6, none lost) |
| CORD train (800), dataset text | 342 | **436** |
| CORD validation (100) | 51 | **62** |
| CORD test (100) | 49 | **60** |

| unchanged by construction, checked | before | after |
|---|---|---|
| SRD CLI totals / tax | 150 / 126 | 150 / 126 |
| CORD totals right (train / validation / test) | 749 / 96 / 92 | 749 / 96 / 92 |
| CORD tax right | 322 / 46 / 41 | 322 / 46 / 41 |

**Were the new splits right?** The six SRD gains (1048, 1051, 1065, 1078, 1173, 1175) were
read by eye: each is the receipt's item list. On 1065 a suggested-gratuity table under the
total had blocked it, and on 1175 the item list was one line above "Subtota |". CORD's 116
new splits were checked against the labelled total. 115 match it and the 116th (train-500)
has no labelled total; its items add to the labelled subtotal. The 11 test-split gains and
every ninth train gain were read by eye. What had blocked them was lines under the total
that are not items: "ITEMS 1.00", "DPP 46.636", "NET SALES", "CHARGE5 61,600", "CATEND
50.000", "TOTAL QTY 2 ITEM 2 PCS", "Kembali 33,500".

**How independent this is.** The SRD rules were written from 1173, 1160 and 1060, all in
the set they are scored on. CORD was never looked at while writing them; it was scored once
the SRD version was final, so it is the held-out figure. CORD has item labels upstream, but
the committed `eval/cord/*.jsonl` keep only total, subtotal and tax, so item splits are
scored here by whether they close the labelled total, not item by item. A split always
closes the receipt's own total by construction. The risk is a wrong total confirmed by a
wrong item list, which the guard in change 3 is for.

The page uses the same `parseReceipt`, so its item splits gain too. The page's readings
were not rebuilt in this session (tesseract.js, about 25 more minutes), so its figure was not
measured.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
node eval/srd-fetch.mjs $P
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4
for f in train validation test; do node eval/cord-receipts.mjs eval/cord/$f.jsonl; done
```

The item-split counts came from a short script that runs `parseReceiptPasses` (SRD) or
`parseReceipt` (CORD) on each receipt and counts `itemsOk`. Before: `git stash` the change
to `receipts.mjs`. Tests: `receipt-tax.test.mjs` (23, three new or extended).
