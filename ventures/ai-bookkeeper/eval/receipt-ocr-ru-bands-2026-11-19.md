# Russian slips: a second, enlarged look for the seller (2026-11-19)

Flagship item (5), receipts OCR. The open item from
[`receipt-ocr-ru-forms-2026-11-19.md`](receipt-ocr-ru-forms-2026-11-19.md), "What is left": about
half the remaining seller misses are the OCR's, not the parser's, because the name is not in the
reading at all. That note suggested a second reading of the header crop at a larger scale.

**Short answer: held-out test 106 to 113 of 146 sellers (72.6% to 77.4%), val 117 to 122 (80.1% to
83.6%), no slip lost on either split, totals unchanged (val 139 of 145, test 137 of 148).** The
header crop was the wrong place to look. Three bands down the whole slip are what worked.

## The header was the wrong crop

On val, where the seller's line is in the first reading, it sits anywhere from 10% to 91% of the
way down the photo, and on most slips between 44% and 70%. A Russian fiscal slip prints its
seller in the fiscal block under the items as often as at the top. A first try at the top 35%
enlarged twice (on the first 23 val slips read) put no seller in the text that the whole photo
had not already given. It was dropped before the full run.

## The rule

`rapidocr_rows.py --bands` reads the photo again as three overlapping horizontal bands (0 to 40%,
30 to 70% and 60 to 100% of the height), each enlarged twice (Pillow's Lanczos, which RapidOCR
already installs), and prints the bands' rows one band after another. RapidOCR's detector caps the
long side at 2,000 px, so a 1,200 x 1,600 photo's band reaches the detector at about 1.67 times its
own size. The small type that the detector missed at the photo's size gets found there.

`ocr.mjs receiptTextRapid` runs it only when the first reading looks Russian (20 or more Cyrillic
letters, or an ИТОГ line) and `russianSeller` finds no seller in it (`receipts.mjs
needsSellerLook`). A seller found in the bands is put on the reading's first line
(`withBandSeller`); totals, items and everything else still come from the first reading. If the
second look fails or runs out of time, the first reading is kept. Slips that already have a seller
are never read twice, so the rule cannot lose one the first reading got right.

All three bands were kept: on val's 19 labelled slips with no seller, each band alone took 2, 3
and 1 sellers, any two of them took 4, and all three took 5.

## Scores

Reading: RapidOCR 1.4.4 with the East Slavic PP-OCRv5 recogniser (`rec.onnx` sha256
dc6bf0e8…c9cdee, `dict.txt` 3e95f158…e5e6eb), through the CLI's own `receiptTextRapid`. The labels
rebuilt from the parquet files matched `eval/receipt-ocr-ru/{val,test}.jsonl` byte for byte. The
first readings were re-read this run and give the earlier notes' 117 (val) and 106 (test).

| split | slips read twice | seller in the text | seller taken as the merchant | changed / gained / lost | totals |
|---|---|---|---|---|---|
| val (development) | 21 of 149 | 125 to 129 of 146 | 117 to **122 (83.6%)** | 6 / 5 / 0 | 139 / 145, unchanged |
| test (held out, scored once after the rule was committed) | 36 of 151 | 125 to 129 of 146 | 106 to **113 (77.4%)** | 8 / 7 / 0 | 137 / 148, unchanged |

On val the one slip that changed but was not gained took a different legal-form line from the bands
(the first reading's merchant was wrong as well). Item names in the text are unchanged (val 412 of
482), since the bands only add a seller line.

Cost: a second look reads about three times the first reading's pixels; on this container's single
thread that was about 17 s a slip against about 3.5 s for the first reading, paid only by the
14% to 24% of Russian slips whose first reading had no seller.

## Reproduce

```
python3 -m venv v && v/bin/pip install pyarrow rapidocr-onnxruntime==1.4.4
R=https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65/languages/eslav
mkdir hf && curl -L -o hf/rec.onnx $R/rec.onnx && curl -L -o hf/dict.txt $R/dict.txt
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/val-00000-of-00001.parquet
v/bin/python -I eval/receipt_ocr_ru.py val-00000-of-00001.parquet val.jsonl photos-val
v/bin/python -I eval/receipt_ocr_ru_names.py val-00000-of-00001.parquet /tmp/names-val.jsonl   # kept out of the repo
# every photo through the CLI's reader (the second look included), into out/<id>.txt:
RAPIDOCR_PYTHON=v/bin/python RAPIDOCR_REC_MODEL=hf/rec.onnx RAPIDOCR_REC_KEYS=hf/dict.txt OCR_TIMEOUT=600 node -e '
import("./ocr.mjs").then(({ receiptTextRapid }) => { const fs = require("fs"); fs.mkdirSync("out", { recursive: true });
for (const f of fs.readdirSync("photos-val").filter((f) => f.endsWith(".jpg"))) fs.writeFileSync("out/" + f.slice(0, -4) + ".txt", receiptTextRapid("photos-val/" + f)); })'
node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr out
node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr out
```

No photo, reading or name from the dataset is in the repository.

## What is left

- The page: `photoocr.mjs` reads with the browser port of RapidOCR and does not take the second
  look yet. The same three bands drawn on a canvas would bring it there. It was left out of this
  run because another open PR (#17640, picking the alphabet from the photo) was changing those files.
- Val's remaining misses: 17 of 146 sellers are still not in the text at 80% after the bands
  (misread, cut off, or only a shop sign), and 7 are in the text but not taken (a label without a
  legal form, a name misread past 80%, or initials against a full name). See the forms note's table.
