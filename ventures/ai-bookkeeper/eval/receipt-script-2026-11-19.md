# Picking the receipt's alphabet from the photo (2026-11-19)

**Question.** Until today the page's receipt reader asked the visitor to pick a "RapidOCR alphabet",
and the default was Latin. A visitor who photographed a Russian slip and left the default got
the right total but almost never the seller: 20 sellers of 146 on val, against 116 with Cyrillic
picked (`receipt-ocr-ru-page-2026-11-19.md`). Can the page tell from a first reading which
recogniser a photo needs, so nobody has to pick?

**Answer.** Yes. `receiptScript` in `receipts.mjs` reads RapidOCR's Latin reading and calls the
slip Cyrillic when three or more of its words have a lower-case letter followed by two capitals.
The Latin model prints Cyrillic а е о р с у х as Latin lower case inside upper-case words
(`CyMMA` for СУММА, `nPHXOA` for ПРИХОД, `KACCOBbIA` for КАССОВЫЙ), and Latin receipts almost
never do that: their glued words go lower to Capital-lower (`ChickenFried`, `BevSubtotal`).
Brand prefixes (`McDONALD'S`, `iPHONE`, `eBAY`) are set aside. Text that is already Cyrillic
(ten letters or more) is Cyrillic.

The page's new default, "From the photo", reads each photo with the Latin recogniser and, when
`receiptScript` says Cyrillic, downloads the Cyrillic one (once, ~8 MB, hash-checked) and reads that
photo again; the Cyrillic reading then leads the vote. A batch of Latin receipts never downloads
the Cyrillic model.

## How it was measured

All readings are RapidOCR's (`rapidocr-onnxruntime` 1.4.4) through `eval/rapidocr-photos.py`, the
reading the CLI's `--rapidocr` makes, with the default Latin recogniser and, for the Russian sets,
PaddleOCR's East Slavic one (`RAPIDOCR_REC_MODEL`). The rule was written from two development sets
and then scored once on three held-out sets.

| set | what | photos | picked right |
|---|---|---|---|
| receipt-ocr-ru val (development) | Russian slips | 149 | **147 Cyrillic** |
| SRD (development) | US restaurant and shop receipts | 200 | **200 Latin** |
| receipt-ocr-ru test (held out) | Russian slips | 151 | **148 Cyrillic** |
| CORD validation (held out) | Indonesian receipts | 100 | **100 Latin** |
| WildReceipt test (held out) | US, European and Asian receipts | 472 | **470 Latin**, then 472 (below) |

On val, the count the rule uses was 3 to 30 on 147 slips (2nd percentile 3); the most on any
SRD receipt was 2. The two val misses are a near-blank photo (5 words) and a 33-word slip with two
such words. The three test misses are short slips too (27, 34 and 43 words), whose readings carry
`KACCA` and `HAC 5%` (НДС) but fewer than three mixed words: a known-word rule would catch them,
but it would be fitted to test, so it is left for a fresh set (see Next).

The two WildReceipt misses were quantities glued to item names, `1xBTL`, `1xPT`, `10xTVA` (with
`PrixHT` and `VAPiANO`, three words each). A quantity is not a word, so the rule now cuts a leading
`<digits>x` before it looks. That cut was found on WildReceipt, so WildReceipt is no longer a
held-out check of it: with it, 472 of 472; every other set's count is unchanged (147, 200, 148,
100, and 29 and 28 in the browser). A Latin receipt taken for Cyrillic costs a second reading and
the Cyrillic model's download, and its Cyrillic reading leads the vote, so this direction matters
more than the other.

### What a visitor gets, by recogniser

Totals and sellers scored as in `receipt-ocr-ru-page-2026-11-19.md` (`eval/cord-receipts.mjs`,
`eval/receipt-ru-names.mjs`; "taken" is the merchant the parser picks, matched to the labelled
seller). "Auto" is the reading the page keeps: the Cyrillic recogniser's where `receiptScript`
said Cyrillic, else the Latin one (`node eval/receipt-script.mjs --auto`).

| set | reading | totals right | seller in the text | seller taken | item names in the text |
|---|---|---|---|---|---|
| val | Latin (the old default) | 140 / 145 | 44 / 146 | 20 / 146 | 71 / 482 |
| val | Cyrillic (picked by hand) | 139 / 145 | 125 / 146 | 117 / 146 | 412 / 482 |
| val | **auto** | 139 / 145 | 124 / 146 | **116 / 146** | 412 / 482 |
| test | Latin (the old default) | 137 / 148 | 43 / 146 | 16 / 146 | 81 / 459 |
| test | Cyrillic (picked by hand) | 137 / 148 | 125 / 146 | 106 / 146 | 379 / 459 |
| test | **auto** | 136 / 148 | 125 / 146 | **106 / 146** | 379 / 459 |

So for a visitor who leaves the default, sellers taken on held-out Russian slips go from 16 to
106 of 146 and item names from 81 to 379 of 459, the same as picking Cyrillic by hand. One test
total is lost: a short slip the rule left on Latin, whose Latin reading has the total wrong where
the Cyrillic one has it right (the auto reading is otherwise the hand-picked one).

### The page's own reading

The rule reads text, so what matters is that the browser's reading looks like Python's. 57 photos
(29 val slips, 28 SRD receipts, every fifth and seventh) were read by the page's own RapidOCR in
headless Chromium (`eval/rapidocr-browser.mjs`, Latin, 5.6 s a photo): `receiptScript` picked
Cyrillic on 29 of 29 and Latin on 28 of 28.

### Cost

A Russian photo is read twice by RapidOCR (Latin, then Cyrillic), about 5 s more a photo in the
browser; the second reading starts as soon as the first is in and runs beside tesseract's readings.
The Cyrillic model downloads once, the first time a photo needs it.

## Integrity notes

- The threshold (three words) and the brand prefixes were set on val and SRD only. CORD,
  receipt-ocr-ru test and WildReceipt test were scored once with that rule; their misses were then
  printed to describe them. The rule was changed once after, for WildReceipt's glued quantities,
  and that is reported as a change found on WildReceipt, not a held-out result.
- No photo, reading, seller or item name from any dataset is in the repository. The test file's
  slips are written in the datasets' style, not copied from them.

## Reproduce

From the venture directory, with the photos fetched as in `receipt-ocr-ru-page-2026-11-19.md`
(receipt-ocr-ru val and test), `eval/srd-fetch.mjs`, `eval/cord_images.py` (validation) and
`eval/wildreceipt.py` (test):

```
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py photos-val lat-val $k 4 & done; wait
for k in 1 2 3 4; do OMP_NUM_THREADS=1 RAPIDOCR_REC_MODEL=hf/rec.onnx RAPIDOCR_REC_KEYS=hf/dict.txt v/bin/python eval/rapidocr-photos.py photos-val es-val $k 4 & done; wait
# the same for test, srd, cord and wildreceipt (Latin only)
node eval/receipt-script.mjs lat-val=cyrillic lat-test=cyrillic lat-srd=latin lat-cord=latin lat-wr=latin
node eval/receipt-script.mjs --auto lat-val es-val auto-val
node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr auto-val
node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr auto-val
```

Tests: `receipt-script.test.mjs` (the rule on written slips; `readPhotos` with "auto" loads the
Cyrillic reader only when a photo needs it, keeps the Latin reading when it cannot load, closes it).

## Next

- A fresh labelled source of Cyrillic slips (Ukrainian, Bulgarian, Kazakh) to check the rule beyond
  Russian fiscal receipts, and to try a known-word rule (`KACCA`, `HAC n%`) for short slips.
- The CLI still takes the recogniser from `RAPIDOCR_REC_MODEL`; it could say "this slip looks
  Cyrillic" when it is unset.
