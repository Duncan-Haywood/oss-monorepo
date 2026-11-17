# RapidOCR and tesseract together: `--rapidocr --four-pass` (2026-11-17)

PR #16823 ([`rapidocr-2026-11-17.md`](rapidocr-2026-11-17.md)) added `receipts --rapidocr`,
which reads a photo once with RapidOCR (PaddleOCR's PP-OCRv4 models through ONNX Runtime,
Apache-2.0, run locally) in place of tesseract. Its next item was "a vote weight to mix it
with tesseract", and RapidOCR on train shards 1-3. This run, started in parallel, did both.
After a merge it uses #16823's `rapidocr_rows.py` and `receiptTextRapid`, and every number
below was re-read with that script.

**What changed:** `receiptPassesFromFile` takes a lead reading, read before tesseract's and
voted with them (`parseReceiptPasses`); one that fails is dropped. `--rapidocr --four-pass`
passes `receiptTextRapid` as the lead, so RapidOCR's reading comes first, then tesseract's
four readings, and all five vote. `RECEIPT_OCR_LEAD` does the same with any command shaped
like `RECEIPT_OCR_CMD`. `--rapidocr` alone is unchanged.

**The order was chosen on train shards 1-3 only** (600 photos, 583 labelled; never used to
choose a rule before today). RapidOCR first beat RapidOCR last by 17 totals there. Validation,
SRD and test were scored after that choice.

## Results (totals right; tax right / wrong / none)

| set | tesseract four (`--four-pass`) | RapidOCR alone (`--rapidocr`) | **RapidOCR first, then the four** | the four, then RapidOCR |
|---|---|---|---|---|
| CORD train shards 1-3, of 583 | 362 | 515 | **510** | 493 |
| tax, of 267 | 135 / 25 / 107 | 172 / 10 / 85 | **203 / 19 / 45** | 197 / 22 / 48 |
| CORD validation, of 98 | 70 | 83 | **86** | 86 |
| tax, of 47 | 27 / 4 / 16 | 36 / 1 / 10 | **40 / 3 / 4** | 39 / 2 / 6 |
| SRD US photos, of 196 | 156 | 180 | **181** | 173 |
| tax, of 185 | 135 / 11 / 39 | 142 / 7 / 36 | **162 / 9 / 14** | 161 / 10 / 14 |
| CORD test (held out), of 95 | 56 | 80 | **80** | 75 |
| tax, of 41 | 16 / 3 / 22 | 28 / 1 / 12 | **32 / 3 / 6** | 32 / 3 / 6 |

Adding tesseract's four readings after RapidOCR's leaves totals about level (train −5,
validation +3, SRD +1, test 0). It adds taxes everywhere: +31 train, +4 validation, +20 SRD,
+4 test. Most of those are receipts where RapidOCR read no tax and a tesseract reading did.
The cost is a few more wrong taxes (train 10 to 19) and the time of four tesseract runs.

Putting RapidOCR last instead loses totals (test 75, SRD 173): the vote's tie-break keeps the
first reading. That is why the order matters and why it was fixed on train.

Speed: about 0.5 s a photo for RapidOCR on 4 CPU cores with its models loaded, plus about
1 s to load them per CLI call, plus tesseract's four readings.

## Integrity notes

- CORD test had already been scored for `--rapidocr` alone in PR #16823 (80). This run scored
  the combination on test twice: once with this branch's first row-assembly script (80) and
  once with #16823's (80, above). No choice was made from either score.
- A first version of this run used its own box-to-line script. Its numbers differ by a few
  receipts from those above (train RapidOCR alone 509 against 515) and were replaced. The
  script was dropped in favour of #16823's.

## Reproduce

```
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4
# one reading per photo with rapidocr_rows.py into $O/rows; tesseract readings as in
# cord-train-shards-2026-11-17.md
node eval/cord-receipts.mjs eval/cord/test.jsonl --ocr $O/rows,$O/psm6,$O/psm4,$O/g6,$O/g4
RAPIDOCR_PYTHON=v/bin/python node cli.mjs --books b.json receipts photo.jpg --rapidocr --four-pass
```

Tests: `receipt-crosscheck.test.mjs` ("RECEIPT_OCR_LEAD ...": a lead command, a lead function,
a failing lead, a PDF).
