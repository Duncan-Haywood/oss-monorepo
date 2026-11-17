# RapidOCR's parser misses on CORD train shards 1-3 (2026-11-17)

Flagship item (5), receipts OCR. With RapidOCR as the photo reader
([`rapidocr-2026-11-17.md`](rapidocr-2026-11-17.md)), CORD train shards 1-3 read 515 of 583
labelled totals. Of the 68 misses, the right total's digits are on some line of the reading
for 45: the parser, not the OCR, lost them. This run read those 45 and wrote rules from them
only. Development set: train shards 1-3 (`train-0000{1,2,3}-of-00004-*.parquet`, revision
`7f0115a4`, Clova AI, CC BY 4.0, not copied here), read again with `eval/rapidocr-photos.py`
(RapidOCR 1.4.4, `rapidocr_rows.py`); the reading reproduced main's 515 exactly.

## What the misses were, and what changed (`receipts.mjs`)

| cause (receipts) | change |
|---|---|
| `Pay Cash 50.000  Change:5,000` on one line (train-443, -496, -596, -629), or `Change:8,000` on its own (train-390): the colon glued the change to its word, which `WHOLE` does not read through, and the cash line's last amount was the change | on a whole-unit slip a letter, then `:` or `=`, then a digit gets a space (a time keeps its colon: a digit comes before it); in the no-total-line path the cash is what comes before the change word on its line and the change what comes after |
| `DU1,241,790`: DUE with its E lost and the amount glued on; cleanOcr reads it `0U1,241,790` (train-266, -475, -674, -711, -777, all one restaurant's slips) | a line starting `DU`/`0U` with a grouped amount glued on reads as `DUE 1,241,790` |
| `TOTAL OTY 5PCS` (Total Qty) beat `DUE 42,500` (train-469); `Ch ange Due 9.000` (train-520); `Discount total 129000-` (train-439); `Total Discont 94,500` above `Grand Tatal 115,500` (train-660) | `NOT_TOTAL_RE`: `total oty`, `total disc...`, `discount total`, `ch ange` |
| a total word OCR misspelt: `Tota.......  81,000` (train-603), `Tatai...`, `Tatal`, `Grand Tatal` | `FUZZY_TOTAL_RE` (`t[aeo]t[aeo]?[ail1]` at a line's start), **only when no real total line was read**, the last such line with an amount; the receipt says "total line's word read as ...: check the total" |
| `Toripaitan  IDR71,500` ... `Total  IDR215,985` (train-693): IDR glued on as Rp is; cleanOcr reads it `10R` | `RP` takes `IDR` and `10R` before a digit |
| the total's word lost, its amount on a line of its own, and the line read as `TOTAL` holding the cash or a stray number: `TOTAL 2921` / `45,499` / `TUNAI 50,000` / `KEHEALI 4,501` (train-573); `SUBTOTAL 33,000` / `TAX10% 3,300` / `36,300` / `TOTAL 50,000` / `CASH 13,700` (train-562, -636, -779, -691, -700) | a new single-reading check on whole-unit slips: when no check confirms the total, and cash less change or subtotal plus tax gives an amount the slip prints on a line of its own (or as its subtotal), exactly one such amount, not under a subtotal, is the total. To feed it: `TAX10%` is a tax line (the rate glued on), `SUB.TOTAL` and `DPP`/`DFP` (the taxable base) are subtotals, and the OCR spellings of Kembali (`KEBALI`, `KEPBALI`, `KEHEALI`, `KEMEALI`) are the change word. PB1 lines (cleanOcr `P81`) count as a tax in this rule only: among the general checks, subtotal plus PB1 one rupiah off a rounded total moved train-735 from right to wrong |
| `TOTAL  127,500  4` (train-436): a stray digit after the total | on a whole-unit total line, amounts under 100 units after one of 1,000 or more are dropped |
| a guard the first version needed: `CASH[94,999]  66646` / `Change:5,001` under `SUB.TOTAL 86,363` (train-668) became 61,645 once `Change:` read | cash less change is not the total when it is under a subtotal the slip prints |

## Results (totals right; tax right / wrong / none)

Main is `ac0dbcb46`; both columns score the same readings.

| set | main | this run |
|---|---|---|
| **CORD train shards 1-3, RapidOCR (development)**, of 583 | 515, tax 172 / 10 / 85 | **539**, tax 177 / 10 / 80 |
| CORD validation, RapidOCR, of 98 | 83, tax 36 / 1 / 10 | **85**, unchanged |
| CORD validation, tesseract four | 70, tax 27 / 4 / 16 | **72**, tax 26 / 5 / 16 |
| CORD validation, RapidOCR then the four | 86, tax 40 / 3 / 4 | **87**, unchanged |
| CORD validation, same, page (`--settled`) | 86; wrong with no warning 1 | **87**; 1 |
| SRD US photos, RapidOCR, of 196 | 180, tax 142 / 7 / 36 | **182**, tax 141 / 8 / 36 |
| **CORD test (held out), scored once**: RapidOCR | 80, tax 28 / 1 / 12 | **83**, unchanged |
| same, tesseract four | 56, tax 16 / 3 / 22 | **58**, tax 17 / 2 / 22 |
| same, RapidOCR then the four | 80, tax 32 / 3 / 6 | **83**, unchanged |
| same, page | 81; wrong with no warning 8 | **84**; 8 |
| CORD text, train / validation / test | 761 / 97 / 93 | **767** / 97 / **94**, tax unchanged |
| SROIE text (626 receipts) | 611 of 625 | unchanged |

On train, 24 totals were gained and none lost (train-266, -267, -390, -436, -439, -443, -469,
-475, -496, -520, -562, -573, -596, -603, -629, -636, -660, -674, -691, -693, -700, -711, -777,
-779). No receipt in any set went from a right total to a wrong one.

The two tax losses both come from a total becoming right:

- **SRD 1055:** `TOTL 30.58` now reads as the total (it was the cash, 40.00), and the tax reader
  then adds `1COLL GRN-SMALL 1.19` to `TXTL 2.43` because together they close the sum. Total
  right, tax wrong (3.62 for 2.43).
- **CORD validation-93:** the grey `--psm 4` reading's `toTaL 172,000 3` was read as 3; now as
  172,000. That reading's `TAX 15.435` (OCR for 15,636) then wins the tax vote over the split
  at 10% that main fell back on. Total unchanged across the vote, tax wrong.

Held-out test was scored once, after the rules were fixed on train and checked on validation
and SRD. CORD text test had been scored before in earlier runs; its gain (test-96) came from
`Change:` and was not looked at before the choice.

## What is left on train (44)

- 22 OCR-bound: the total's digits are on no line.
- 22 parser-reachable, mostly one-offs: `TOTAL 574` over `574,255` (an amount split across
  lines, train-630); `SUB-TOTAL 72,500,00` with no total line (train-583); `1178.100` (four
  digits before the separator, train-558); `TOTAL. 1.198,648` (mixed separators, train-386);
  a subtotal plus tax that is printed only on the cash line (`CA5H[58,000]`, train-363);
  `Totel 19,008` for 19,000 with `Pembayaran 19,000` below it (train-678); `TOTAL 148.625`
  against `UISA 146.625` (train-539, the card line is right).

## Not measured

Tesseract's four readings of train shards 1-3 were not made this run (about 100 minutes), so
the five-reading vote and the page were scored on validation and test only. SRD was read with
RapidOCR only.

## Reproduce

```
python3 -m venv ro && ro/bin/pip install rapidocr-onnxruntime==1.4.4 pyarrow
ro/bin/python -I eval/cord_images.py train-00001-of-00004-7dbbe248962764c5.parquet train photos   # and shards 2, 3
for k in 1 2 3 4; do OMP_NUM_THREADS=1 ro/bin/python eval/rapidocr-photos.py photos rows $k 4 & done; wait
node eval/cord-receipts.mjs eval/cord/train.jsonl --ocr rows --misses
# tesseract four: node eval/srd-cli.mjs <photos> <out> k/4, then --ocr rows,<out>/psm6,<out>/psm4,<out>/g6,<out>/g4 [--settled]
```

Tests: `receipt-rapidocr-misses.test.mjs` (10), `cord-receipts.test.mjs` (text pins 94 and
767), `cord-train-shards.test.mjs` (its page-text fixture no longer uses words that now read
as a total line).
