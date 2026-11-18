# CORD train photos: a fresh development set for receipt photos (2026-11-17)

Flagship item (5), receipts OCR. Every photo rule so far was chosen on CORD's 100
validation photos or the 200 SRD photos, and CORD test was kept for one score at the end.
That makes validation an overused development set. This run read the first of CORD-v2's
four train shards (200 photos, `train-00000-of-00004-b4aaeceff1d90ecb.parquet`, revision
`7f0115a4`, Clova AI, CC BY 4.0, not copied here) the way the CLI does (`--four-pass`:
tesseract 5.3.4 `--psm 6` and `--psm 4`, then the same on a grey copy at 2,000 px), and
wrote the rules from those misses only.

## The overfitting check, before any change

| photos, CLI four readings, main `d1e53ac7b` | totals right | tax right / wrong / none |
|---|---|---|
| CORD validation (rules were chosen here) | 69 / 98 (70.4%) | 27 / 3 / 17 |
| **CORD train shard 0 (never seen)** | **115 / 196 (58.7%)** | 37 / 5 / 43 |
| CORD test (held out) | 54 / 95 (56.8%) | 16 / 2 / 23 |

Validation is 12 points above two sets the rules never saw. Unseen photos sit near 57-59%,
which is the honest number for a phone photo of an Indonesian receipt today. (Test read 54
here against 53 in the last note: same code, a fresh tesseract run; one photo differs.)

Of train's 81 misses, the total is not in any of the four readings for 49 (OCR-bound: no
parser change can fix them). The rules below come from the other 32.

## What changed

1. **`cleanocr.mjs`**: `SUB. TOTAL` / `SUB, TOTAL` is `SUB TOTAL` (train-59: the subtotal
   was taken as the total line); `TOTA 24.000` is a total line (the L lost, train-87);
   `26, OOO` after a group separator is `26, 000` (train-87).
2. **Cash and change, Indonesian**: `Bayar` / `Pembayaran` (paid) is the cash line when the
   line has no total word (`Total Bayar` stays the total); `Kembal` (cut `Kembali`) is the
   change (train-45, -31).
3. **A whole-unit total under 100 units** (`Total 10 4` read as 4, `TL - 2, OG` as 2) gets no
   vote and puts no total in doubt for `checkedAcrossReadings` (train-31, -84). On a
   whole-unit slip a change under 100 units is no cash-less-change check (cut short).
4. **No barcodes as amounts**: when no total line is found on a whole-unit slip, a run of
   eight or more digits with no separator is not taken as the largest amount
   (train-64: 804,700,027; train-193: 8,991,038,772,194).
5. **`Qty: 3 Amount: 262,000`** is a total line (a common Indonesian POS footer; train-64,
   -193).
6. **Subtotal at the tax rate**: on a whole-unit slip that prints a tax line, any read
   subtotal plus 10% or 11% (PB1, PPN), rounded to the unit, is a check in the vote
   (train-162: "Subtotal Rp 37,800" makes 41,580, which one reading printed and three
   did not).
7. The disagreement note no longer says "which the receipt's arithmetic confirms" when no
   check confirms the pick; it says "which most readings give but no check confirms: check
   the total".

Tried and dropped: with no total line, taking the subtotal plus a read tax before the
three-amount (total, cash, change) guess. +1 train photo, but CORD text lost 3 totals
(train 761 to 759, validation 97 to 96) and a tax.

## Results

| set | main `d1e53ac7b` | this run |
|---|---|---|
| CORD train photos (development) | 115 / 196, tax 37 / 5 / 43 | **122**, tax 38 / 5 / 42 |
| CORD validation photos | 69 / 98, tax 27 / 3 / 17 | **70**, tax 27 / 4 / 16 |
| **CORD test photos, scored once** | 54 / 95, tax 16 / 2 / 23 | **55**, tax 16 / 3 / 22 |
| CORD test photos, page (`--settled`) | 52; wrong with no warning 5 | **53**; wrong with no warning **2** |
| SRD photos, CLI four readings | 155 / 196, tax 135 / 11 / 39 | **156**, tax unchanged |
| SRD photos, page (`--settled`) | 154; wrong with no warning 3 | **155**; wrong with no warning 4 |
| CORD text, train / validation / test | 749 / 97 / 92 | **761** / 97 / **93** |
| CORD text, tax | 324 / 46 / 41 | unchanged |
| SROIE text (626) | totals 611, dates 601, merchants 531 | unchanged |

Train photos gained train-31, -45, -59, -64, -87, -162, -193 and lost none. Validation
gained validation-38; validation-61's total moved from 2 to 8,260 (wrong both ways, now
with a tax of 460 where it had none: its subtotal reads 7,800 for 7,500). SRD gained 1157
(9.70; 44.00 before); 1038 moved from 20.00 to 17.50 (17.80 is right), which the page no
longer flags. CORD text gained twelve train totals (mostly `SUB. TOTAL` lines read as the
total) and test-29; three wrong train totals changed to other wrong values.

The held-out test gain is small: one total, and three fewer wrong totals the page shows with
no warning. Most of the train gain does not transfer, as expected from one shard; the
remaining shards (600 photos) are the next development set.

## What is left

- 49 of 81 train misses are OCR-bound (the total is in no reading). More readings, not
  more parsing, are where those are: a different binarisation or a crop to the bottom third.
- train-95/-97 (one photo twice in CORD), -125: `1` read as `4` in every reading
  (12,000 as 42,000); the subtotal 12,000 read four times with no tax line could decide it.
- train-65: "Total 650,100" in one reading against "Total 334100" in another; its subtotal
  591,000 at 10% is 650,100, but no reading prints a tax line, so rule 6 does not fire.

## Reproduce

```
apt-get install -y tesseract-ocr
python3 -m venv v && v/bin/pip install pyarrow
H=https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data
curl -LO $H/train-00000-of-00004-b4aaeceff1d90ecb.parquet
v/bin/python -I eval/cord_images.py train-00000-*.parquet train photos
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs photos $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/cord/train.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 --misses
```

(the scorer skips receipts with no reading, so the 200 photos score against their 200 of the
800 train labels). Validation, test and SRD as in
[`cord-wrong-totals-2026-11-17.md`](cord-wrong-totals-2026-11-17.md). Tests:
`cord-train-photos.test.mjs` (all six fail on main), `cord-receipts.test.mjs` (the text
numbers).
