# Russian slips, train shard 2: a clean read, then slips with no ИТОГ amount (2026-11-18)

Flagship item (5), receipts OCR. [`receipt-ocr-ru-2026-11-18.md`](receipt-ocr-ru-2026-11-18.md)
read cdek-ocr/receipt-ocr-ru's val, test and train shards 0 and 1, wrote the Russian total
rules from them and left train shard 2 (233 photos, `data/train-00002-of-00003.parquet`)
unread "as a clean set for the next change". This run read it.

```
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/train-00002-of-00003.parquet
v/bin/python -I eval/receipt_ocr_ru.py train-00002-of-00003.parquet eval/receipt-ocr-ru/train2.jsonl photos-train2
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py photos-train2 ocr-train2 $k 4 & done; wait
node eval/cord-receipts.mjs eval/receipt-ocr-ru/train2.jsonl --ocr ocr-train2 --misses
```

233 labels, 221 with one total; the labelled items make the total on 203 (202 of the 221).
232 photos (one id has no photo of its own in the shard). RapidOCR only, the CLI's `--rapidocr`.
The labels for val, test and train 0 and 1 rebuilt byte-for-byte from the parquet files.

## The clean figure, before any change

Scored once, on the code on main, before any miss was read:

| set | totals right (main) |
|---|---|
| **train shard 2, 221** | **196 (88.7%)** |
| train shard 2, items make the total (202) | 181 (89.6%) |
| train shard 1 for comparison (the last clean read) | 203 / 230 (88.3%) |

So the rules written from the first four splits hold on a fifth: 88.7% against shard 1's 88.3%.
This is the number to quote for RapidOCR on Russian receipt photos.

## What the 25 misses showed

18 of the 25 had no total line with an amount, and the parser fell back on the largest amount on
the slip. The largest amount on a Russian slip is often not money at all: a fiscal number or an
INN read as a price (`2149705630`, `180473100`), or a price before the discount. By cause:

- **The bank terminal's slip under the receipt said it** (5): `CyMMa<Py6>: 89.99`,
  `CyHMa(Py6): 698.86`, `CyMMa (Py6): 355.96`. That is the card terminal's "СУММА (РУБ)", what
  the card was charged, printed whenever the slip was paid by card.
- **`MTOr` alone on its line**, the amount on the line below, which carries words (the card line
  `6E3HANN4HBIM 1828.00`, or `CYMMA HAC20% =39617.00`). The bare-line rule needs the next line to
  be only an amount.
- **ИТОГ read with another last letter**: `HTOI 89.99`, `HTOI 422.00`, `HTOD 89.9%`, `ИTOI`.
- **The point read as a dash between spaces**: `HTor 1247 -00`.
- OCR-bound: metro tickets whose `ИТОГ:` line and amounts were not read at all (2), a reversed
  amount (`00'05=` for 503.00), item rows the engine merged, a ИТОГ amount misread.

## The changes (`receipts.mjs`)

1. When no total line gave an amount, before the card-line and largest-amount fallbacks: the
   card terminal's `СУММА (РУБ)` amount (`RU_TERMINAL_RE`; on its line or a bare line below),
   when the slip prints one such amount.
2. Failing that, on a slip with Russian evidence (a ИТОГ word or a `НДС`/`HAC 5%` line) and no
   change (`СДАЧА`, `RU_CHANGE_RE`) with an amount: the card or cash line's amount, when the card
   and cash lines agree on one amount **and it is printed on two lines or more**.
3. `ruTotalLine` reads `1247 -00` as 1247.00, and the repeat rule (an ИТОГ amount printed once
   gives way to one printed more often below it) now reads the ИТОГ line the same way, so it
   counts that line's amount instead of none.

Each leaves a note ("check the total").

**Two tries that lost, and were cut.** Adding `I` to the look-alike ИТОГ (`HTOI`) gained one
slip and lost two: on `HTOI =41.38` and `ИTOI =322.00` the engine misread the amount, and the
largest-amount fallback had been right. The card line without the printed-twice condition lost
seven café slips from one shop, where the engine's rows run one off and the card line carries the
VAT amount (`6E3HAIM4H6M =26.77` on a 562.00 slip). With both, shard 2 read 193, below main's 196.

Tests: `receipt-russian.test.mjs`, three new tests (3 failing on main), text made up in the
photos' style: the terminal amount, a lone `MTOr` over a repeated card line, a café slip whose
card line is not taken, change given, `1247 -00`. The whole ai-bookkeeper suite passes (3,388
tests, `python3 platform/ci/run_venture_tests.py ai-bookkeeper`).

## Results

| set | main | this change |
|---|---|---|
| train shard 2, 221 (the rules were written from its misses) | 196 | **202** (91.4%) |
| train shard 2, items make the total (202) | 181 | **185** |
DEVROWS
| CORD hand-corrected text, train / validation / test | 767 / 97 / 94 | same |

Six gained on shard 2 and none lost. Because the changes came from shard 2's misses, 202 is a
development figure. No untouched split of this dataset is left; the 88.7% above is the last
clean one. The new patterns match none of the 12,697 lines of the venture's other text,
JSONL, CSV and JSON files (the CORD and WildReceipt sets, the fixtures).

## Open

- ИТОГ read as `HTOI`/`HTOD` with a misread amount: a second reading (tesseract `-l rus+eng` behind
  RapidOCR's lead, the vote the other receipt sets use) could say which amount to trust.
- The terminal's amount split over three lines (`CyMHA` / `Py6` / `118.93`).
- `HH6IMH: 328.69` (НАЛИЧНЫМИ cut to its tail) is not read as a payment line.
