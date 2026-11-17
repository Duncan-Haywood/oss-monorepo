# A second OCR engine: PP-OCRv4 through RapidOCR (2026-11-17)

The CORD train-shard run ([`cord-train-shards-2026-11-17.md`](cord-train-shards-2026-11-17.md))
found that on 148 of 221 missed totals, the total is in none of tesseract's four readings,
and that a crop of the bottom of the photo recovers 5 of them. Parsing rules can't reach those
photos, so this run tried a different engine.

**The engine:** PP-OCRv4 (PaddleOCR's text detection and recognition models, Apache-2.0), run
through RapidOCR 1.4.4 (`rapidocr_onnxruntime`, Apache-2.0) on ONNX Runtime. The three ONNX
models ship inside the pip wheel (`ch_PP-OCRv4_det_infer.onnx`, `ch_PP-OCRv4_rec_infer.onnx`,
`ch_ppocr_mobile_v2.0_cls_infer.onnx`), so nothing is downloaded at run time. It runs on the
user's machine on CPU and uploads nothing. [`tools/rapidocr_receipt.py`](../tools/rapidocr_receipt.py)
turns its word boxes into text lines: a box joins the row whose middle is within half a box
height of its own, rows run top to bottom and words left to right. It prints them in the
shape the receipt parser already reads.

Speed: about 0.5 s a photo on 4 CPU cores with the models loaded (800 CORD photos in about
7 min). A one-photo CLI call also pays about 1 s to load the models.

## Results

Same readings, same scorer (`eval/cord-receipts.mjs --ocr`), same parser (main after PR #16822).
"Lead + four" is what the CLI now does with `RECEIPT_OCR_LEAD` and `--four-pass`: the PP-OCR
reading first, then tesseract's four, all voting (`parseReceiptPasses`). The order was chosen
on the train photos only (development). PP-OCR alone gave 509 totals and 173 taxes there; lead
+ four gave 508 and 202; four + PP-OCR last gave 490 and 196. Validation and test were scored
after that choice, and test only once.

| set | tesseract four readings | PP-OCR alone | **lead + four** |
|---|---|---|---|
| CORD train shards 1-3 (development), totals of 583 | 362 (62.1%) | 509 (87.3%) | **508 (87.1%)** |
| same, tax of 267 (right / wrong / none) | 135 / 25 / 107 | 173 / 12 / 82 | **202 / 21 / 44** |
| CORD validation, totals of 98 | 70 (71.4%) | 80 (81.6%) | **84 (85.7%)** |
| same, tax of 47 | 27 / 4 / 16 | 35 / 1 / 11 | **40 / 3 / 4** |
| **CORD test (held out, scored once), totals of 95** | 56 (58.9%) | 78 (82.1%) | **80 (84.2%)** |
| same, tax of 41 | 16 / 3 / 22 | 27 / 1 / 13 | **32 / 3 / 6** |
| SRD US receipt photos, totals of 196 | 156 (79.6%) | 180 (91.8%) | **180 (91.8%)** |
| same, tax of 185 | 135 / 11 / 39 | 141 / 6 / 38 | **161 / 9 / 15** |

Of the 221 train totals tesseract's four readings missed, the total's digits were in none of
them for 148; PP-OCR's one reading lacks them for only 22. On every set, lead + four reads more
totals than tesseract's four and more taxes than PP-OCR alone. Its "wrong" tax count is a
little higher than PP-OCR alone because it reads a tax on many more receipts.

The rules in `receipts.mjs` were written from tesseract's misreadings. None were changed for
PP-OCR, so these numbers are the engine swap alone. PP-OCR's own misses are the next
development set.

## Caveats

- The models are trained mainly on Chinese and English text. CORD (Indonesian, Latin script)
  and SRD (US English) are both Latin script. A receipt in another script is untested.
- The web page still reads photos with tesseract.js, in the browser. PP-OCR in the page
  would need onnxruntime-web and about 16 MB of models fetched by the browser. That is the
  next step, not done here.
- SRD totals were read by eye (`eval/srd/labels.jsonl`). CORD's were labelled by Clova AI.

## Reproduce

```
python3 -m venv v && v/bin/pip install rapidocr_onnxruntime==1.4.4
v/bin/python -I tools/rapidocr_receipt.py --batch photos $O/rapid       # one <id>.txt per photo
node eval/cord-receipts.mjs eval/cord/test.jsonl --ocr $O/rapid,$O/psm6,$O/psm4,$O/g6,$O/g4
```

Photos and tesseract readings as in [`cord-train-shards-2026-11-17.md`](cord-train-shards-2026-11-17.md)
(CORD) and `eval/srd-fetch.mjs` plus `eval/srd-cli.mjs` (SRD). The CLI does the same per photo:

```
RECEIPT_OCR_LEAD="v/bin/python tools/rapidocr_receipt.py" node cli.mjs --books b.json receipts photo.jpg --four-pass
```

Tests: `receipt-crosscheck.test.mjs` ("RECEIPT_OCR_LEAD ..."), `tools/test_rapidocr_receipt.py`
(the line assembly, with no engine needed).
