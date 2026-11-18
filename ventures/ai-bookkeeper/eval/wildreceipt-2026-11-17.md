# WildReceipt: 472 held-out receipt photos from a new source, and the rules its train photos found (2026-11-17)

Flagship item (5), receipts OCR. The row said "All CORD photos are read; fresh ones need a new
source." This is that source: **WildReceipt** (Sun et al. 2021, Apache-2.0; labels in
[`wildreceipt/`](wildreceipt/README.md)), 1,740 receipt photos with hand-labelled total, subtotal
and tax boxes. Unlike CORD (Indonesian, rupiah) and SRD (US restaurants), it mixes US, European,
Asian and Australian shops, restaurants, fuel stations and hotels, in several languages, and half
its photos are small. Nothing in the parser was written from it before this run.

## Setup (this session)

- huggingface.co answered; download.openmmlab.com (the original tarball) reset the connection.
  `kaydee/wildreceipt` carries the photos and labelled boxes (test 427 MB, train shard 0 450 MB);
  `podbilabs/wildreceipt-donut` has the same photos as JPEG, `Theivaprakasham/wildreceipt` the
  labels without photos (its labels match `kaydee`'s exactly on all 472 test receipts).
- `eval/wildreceipt.py` writes the labels and photos. RapidOCR 1.4.4 (`eval/rapidocr-photos.py`)
  and tesseract 5.3.4's four readings (`eval/srd-cli.mjs`) on all 1,106 photos and SRD's 200,
  scored with `eval/cord-receipts.mjs`. About 70 minutes of OCR on 4 cores.

## 1. The held-out score before any change

WildReceipt test, 405 single-answer totals and 272 taxes, main as it was:

| mode | totals right | tax right / wrong / none |
|---|---|---|
| tesseract's four readings | 291 (71.9%) | 154 / 28 / 90 |
| RapidOCR alone (`--rapidocr`) | 355 (87.7%) | 164 / 8 / 100 |
| five readings, lead (`--rapidocr --four-pass`) | **357 (88.1%)** | 194 / 17 / 61 |
| the page (`--settled`) | 356 (87.9%) | 191 / 17 / 64 |

That is the first measurement of the receipt reader on a source no rule was written from, and the
totals hold up: 88% against 57-58% on CORD's held-out test photos and 96% on SRD's US photos. Tax
is the weak part: RapidOCR alone left 100 of 272 labelled taxes unread.

## 2. What train shard 0 showed

The first train shard (634 photos, 535 totals, 395 taxes) was the development set. Its RapidOCR
misses fell into a few groups the parser did not know:

- **Tax words glued to their rate or to the word before.** RapidOCR drops spaces: `MwSt19% 2,46`,
  `VAT14.5% Rs.18.12`, `Tax1: 2.79`, `SalesTax $0.38`, `6%GOVTTAX 6.18`, `TOTAL-TAX $1.85`. The
  tax reader wanted `\bmwst\b`, `\btax\b`, `sales\s+tax`, so none of these was a tax line. The
  largest group: about 20 of the 137 unread train taxes.
- **Total lines that are not the total**: `TOTAL SAVED: $44.80` and `TOTAL PROMOTIONAL SAVINGS`
  after the total, `Total Sales Discounts`, `TOTAL INCLUDES GST OF 0.56`, `Total HT` (French,
  before tax), `TOTAL SIN IVA` (Spanish, without VAT), `TOTAL COUNTY TAX`, `Tax/Fee Total`.
- **German `Netto`**: the parser took `Netto` as a total word because Indonesian slips print
  `Netto 137,500` for the total; on a German slip `Netto(1) Eur 129,75` and `Umsatz 19% netto
  12,94` are the amount before VAT.
- **Total words in other languages**: Croatian `UKUPNO` (and, not seen but the same pattern,
  Polish `RAZEM`, Czech `CELKEM`, Turkish `TOPLAM`).

Left alone: a currency code read into the amount (`EC$161.04` read `ECS161.04`, which `cleanOcr`
turns into 5161.04); Quebec's two-column `TOTAL ... 38.85 3.37`; label disagreements (a
Malaysian total labelled before rounding; 11 labels of `0.00`); and totals lost by the OCR.

## The changes (`receipts.mjs`)

1. `TAX_LINE_RE`: a tax word followed directly by a digit (`MwSt19%`, `VAT7%`, `Tax1:`), and
   `sales`, `total` or `govt` glued to a tax word (`SalesTax`, `TotalGST`, `GOVTTAX`).
   `TAX_TOTAL_RE` and `NOT_TOTAL_RE` read `TOTAL-TAX` like `TOTAL TAX`.
2. `NOT_TOTAL_RE`: `total ... saved/savings`, `total sales discount`, `total includes ... tax/GST
   ... of`, `total HT`, `hors taxe`, `sin IVA`, `sans TVA`, `ohne MwSt`, `Tax/Fee Total`,
   `total county/state/city/local tax`, and `Netto` followed by an amount with two decimals after
   a comma, or after a percentage (German net; the Indonesian `Netto 137,500` stays a total).
3. `TOTAL_RE`: `ukupno`, `razem`, `celkem`, `toplam`.

Tests: `receipt-wildreceipt.test.mjs` (7 tests, all failing on main, written in the photos'
style, no dataset text); `cord-receipts.test.mjs` pins CORD train tax 324 to 325.

## Results

Totals right; tax right / wrong / none; "unl." is a tax read where none is labelled.

| set | mode | main | **this PR** |
|---|---|---|---|
| WildReceipt train0 (development), 535 / 395 | RapidOCR | 447; 245 / 13 / 137 | **455; 267 / 16 / 112** |
| | tesseract four | 360; 227 / 31 / 137 | 365; 227 / 31 / 137 |
| | five, lead (CLI) | 449; 297 / 23 / 75 | **458; 305 / 23 / 67** |
| | page | 449; 292 / 21 / 82 | **458; 303 / 21 / 71** |
| **WildReceipt test (held out)**, 405 / 272 | RapidOCR | 355; 164 / 8 / 100 | **358; 185 / 12 / 75** |
| | tesseract four | 291; 154 / 28 / 90 | 294; 154 / 27 / 91 |
| | five, lead (CLI) | 357; 194 / 17 / 61 | **359; 204 / 16 / 52** |
| | page | 356; 191 / 17 / 64 | **358; 202 / 16 / 54** |
| SRD US photos, 196 / 185 | RapidOCR | 188; 144 / 7 / 34 | 188; **152 / 9 / 24** |
| | five, lead and page | 188; 162 / 9 / 14 | 188; **164 / 9 / 12** |
| CORD hand-corrected text | train / val / test | 767 / 97 / 94; tax 324 / 46 / 41 | unchanged; tax **325** / 46 / 41 |

Read plainly: on the held-out photos the CLI reads 10 more taxes right of 272 (194 to 204) and
2 more totals of 405; the page 11 more taxes and 2 more totals. RapidOCR alone, the mode most
affected by glued words, gains 21 taxes and 3 totals. On the development shard the gain in
totals was larger (9), which is what a rule set written from its misses looks like on fresh
receipts. SRD's US photos gain 2 taxes on the CLI and page and lose no total.

The new "tax read where none labelled" cases on train0 were read by hand: `Tax1: 0.96`,
`Vat12.5% 234.44`, `TAX8.25% .17`, `TOTALTAX .00` are real tax lines WildReceipt did not tag;
`PST7X 0.01` is doubtful.

## Integrity notes

- The held-out test was scored with main before any change (section 1, kept before the train
  shard was downloaded) and once with the final code.
- Not clean: before switching to train shard 0 for development, this run printed the test set's
  RapidOCR miss list (id, wanted, got, total line) and read four test receipts in full. Three of
  the changes (`TOTAL SAVED`, `TOTAL INCLUDES ... OF`, German `Netto`) were first seen there and
  then found again on train0, which is where they were checked. The test gain (2 totals, 10
  taxes) should be read with that in mind; the tax rule (change 1), which carries most of the
  gain, was found on train0 only.
- SRD and CORD did not inform the changes; they are regression checks.
- No WildReceipt text or photo is in the repository, only amounts.

## Reproduce

```
apt-get install -y tesseract-ocr imagemagick
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4 pyarrow
H=https://huggingface.co/datasets/kaydee/wildreceipt/resolve/main/data
curl -LO $H/test-00000-of-00001.parquet
v/bin/python -I eval/wildreceipt.py test-00000-of-00001.parquet eval/wildreceipt/test.jsonl wt
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py wt r_wt $k 4 & done; wait
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs wt t_wt $k/4 & done; wait
node eval/cord-receipts.mjs eval/wildreceipt/test.jsonl --ocr r_wt,t_wt/psm6,t_wt/psm4,t_wt/g6,t_wt/g4 --lead [--settled]
```

Train shard 0 the same way from `train-00000-of-00002.parquet` into `train0.jsonl`.

## Next

- Train shard 1 (`train-00001-of-00002`, about 630 photos) is unread: a fresh development set.
- The largest remaining tax group is still RapidOCR's: rates glued after the word with no digit
  boundary (`CATAX9.0000%`), and tax lines whose amount is in a column table (`19% 20,62 4,33
  24,95`: net, tax, gross).
- `EC$` and `US$` read as `ECS`/`USS` before an amount.
