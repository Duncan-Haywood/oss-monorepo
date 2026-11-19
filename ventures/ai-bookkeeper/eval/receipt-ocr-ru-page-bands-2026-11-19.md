# Russian slips on the page: the second look for the seller in bands (2026-11-19)

Flagship item (5), receipts OCR. The open item from
[`receipt-ocr-ru-bands-2026-11-19.md`](receipt-ocr-ru-bands-2026-11-19.md), "What is left": the
CLI reads a Russian slip again as three enlarged bands when its first reading names no seller,
but the page (`photoocr.mjs`, the browser port of RapidOCR) did not.

**Short answer: in headless Chromium, the page's held-out test sellers go from 105 to 114 of 146
(71.9% to 78.1%) and val from 116 to 121 (79.5% to 82.9%). No slip was lost on either split, and
every seller the bands put first was right (val 5 of 5, test 9 of 9). Totals and item names are
unchanged.** The page now matches the CLI (val 117 to 122, test 106 to 113) to within one slip on
each split. That last slip comes from the browser's JPEG decoder, as in the earlier port note.

## What was built

- `photoocr.mjs`: `BANDS` (0 to 40%, 30 to 70% and 60 to 100% of the height, as
  `rapidocr_rows.py`), `bandSize`, `readBands` and `withSecondLook`. Both RapidOCR engines, the
  Web Worker one and the fallback on the page's own thread, get `readBands(file)`. It draws each
  band on a canvas with high-quality smoothing and reads it with the same reader. Then
  `withBandSeller` puts a seller found there on the reading's first line.
- Size: the CLI enlarges each band twice with Lanczos, and RapidOCR then shrinks anything over
  2,000 px on its long side before detecting and cropping (`rapidocr_onnxruntime/main.py`
  `preprocess`, mirrored in `rapidocr-web.mjs`). The page draws the band at that final size
  directly: twice the band, capped at 2,000 px. The same size reaches the detector, without a
  canvas twice the photo's size. On a 1,200 x 1,600 phone photo a band is 2,000 x 1,067.
- `readPhotos`: the second look runs on the reading that leads the vote, from the reader that
  made it. With the alphabet set "From the photo", that is the Cyrillic reader's reading. A Latin
  reading never asks for it, because `needsSellerLook` wants Cyrillic text or an ИТОГ line. If the
  second look fails, the first reading is kept. `bandLooks` and `bandSellers` count the photos.
- `index.html`: the status line says when a slip was read again and whether a seller was found.
  It also records two local usage counters, `receipt_photos_seller_bands_found` and
  `receipt_photos_seller_bands_none`.
- `eval/rapidocr-browser.mjs --bands=<dir>`: writes what the page puts in the receipts box after
  the second look, next to the first reading, from one run.
- Tests: `receipt-seller-bands-page.test.mjs` covers the band sizes and order, the rule (only a
  Russian reading with no seller), a failed look, and `readPhotos` taking the bands from the
  Cyrillic reader in auto mode.

## Measured

Reading: the page's own `loadRapidEngine({ script: "cyrillic" })` in headless Chromium (Web
Worker, one WebAssembly thread), with the East Slavic PP-OCRv5 recogniser at the pinned revision
(`rec.onnx` sha256 dc6bf0e8…c9cdee, `dict.txt` 3e95f158…e5e6eb; the page checks both). The
labels rebuilt from the parquet files matched `eval/receipt-ocr-ru/{val,test}.jsonl` byte for
byte. Test was scored once. The rule is the CLI's, committed before this run, and nothing was
fitted to test.

| split | read again in bands | seller put first | seller in the text (of 146) | taken as the merchant | lost | totals |
|---|---|---|---|---|---|---|
| val | 21 of 149 | 5 | 124 to 128 | 116 to **121 (82.9%)** | 0 | 139 / 145, unchanged |
| test (held out) | 35 of 151 | 9 | 124 to 129 | 105 to **114 (78.1%)** | 0 | 136 / 148, unchanged |

Per slip (`--misses`, compared by id): val misses 30 to 25, test 41 to 32. The only files that
changed are the 5 and 9 slips with a seller put first, and each of those became right.

Cost: about 7 s a photo across all slips, against about 5.5 s for the first reading alone in the
earlier port note. Two splits ran side by side on four cores. Only the 14% to 23% of Russian
slips with no seller in the first reading pay for the second look.

## Also checked: `VAT5%: 668` (WildReceipt train shard 1)

This was a buildable item on the flagship row. It turned out to be already solved. The slip is a
Dubai restaurant's: "Total Due 189.00", "Prices are inclusive of 5% VAT", labelled tax 8.99.
RapidOCR reads the tax line as `VAT5%:  668`, and its digits are wrong, not just missing a decimal
point. Tesseract's `--psm 6` readings give `VAT 5%: 8.99`, and the five-reading vote
(`parseReceiptPasses`, lead on) takes 8.99 with the note "OCR readings disagree on the tax". So
the tax is right in the pipeline that the CLI's `--rapidocr --four-pass` and the page use. The
item was dropped from the row. For the record, 8.99 is the VAT summed line by line on that slip
(1.33 + 1.33 + 1.52 + 2.76 − 2.76 + 3.67 + 1.14). The whole total split at 5% gives 9.00. Splitting
at the rate alone would have been a cent out.

## Reproduce

As in [`receipt-ocr-ru-page-2026-11-19.md`](receipt-ocr-ru-page-2026-11-19.md), "Reproduce", then:

```
node eval/rapidocr-browser.mjs photos-val web-val tgz --script=cyrillic --hf=hf --bands=webb-val
for d in web-val webb-val; do node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr $d; node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr $d; done
```

Do the same for test. No photo, reading or name from the dataset is in the repository.

## What is left

- Val's and test's remaining seller misses are the bands note's: misread, cut off, or only a shop
  sign (17 of val's 146 are not in the text even after the bands).
- The page reads a slip's bands one after another on one thread. A slip that needs them takes
  about three times as long. Reading the three bands in parallel workers would cut the wait, at
  three times the memory.
