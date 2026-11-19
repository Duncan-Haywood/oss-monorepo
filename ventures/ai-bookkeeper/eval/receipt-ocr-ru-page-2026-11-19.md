# Russian slips on the page: the Cyrillic recogniser in the browser (2026-11-19)

The CLI has read Russian slips with PaddleOCR's East Slavic recogniser since 2026-11-18
([`receipt-ocr-ru-eslav-2026-11-18.md`](receipt-ocr-ru-eslav-2026-11-18.md)), and the merchant
rules since then take the seller on 117 of 146 val slips and 106 of 146 held-out test slips
([`receipt-ocr-ru-forms-2026-11-19.md`](receipt-ocr-ru-forms-2026-11-19.md)). The page's
JavaScript RapidOCR port still loaded only the default (Latin and Chinese) recogniser, so in the
browser a Russian slip got its total but not its seller (the default reading takes the seller on
about 20 of 146). This run brings the Cyrillic recogniser to the page.

## What was built

- `rapidocr-web.mjs`: `RAPID_RECOGNISERS` (`latin`, the default; `cyrillic`), `rapidModelUrls(script)`
  and `fetchRapidModels(fetchBytes, script)`. The Cyrillic recogniser is not on npm, so it comes
  from Hugging Face (`monkt/paddleocr-onnx`, `languages/eslav/rec.onnx` and `dict.txt`) at the
  pinned revision `7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65`, and both files must hash to the
  sha256 values the CLI note recorded (`rec.onnx` dc6bf0e8…c9cdee, `dict.txt` 3e95f158…e5e6eb) or
  the reader refuses them with an error that says so. Detection and the 180-degree classifier are
  the same models for both scripts.
- `rapidocr-worker.mjs`: the `open` message carries `script`; opening with a different script
  closes the old reader and starts a new one.
- `photoocr.mjs`: `loadRapidEngine({ script })`, `loadRapidWorker(worker, { script })`,
  `loadRapidInPage({ script })`, `readPhotos(files, { rapidScript })`. A hash failure is not
  retried on the page's own thread (it would fail the same way).
- `index.html`: a "RapidOCR alphabet" choice beside the RapidOCR box: Latin (the default) or
  Cyrillic (about 8 MB more, once). Usage events `receipt_photos_rapidocr_cyrillic` and
  `receipt_photos_rapidocr_cyrillic_failed`, local counters like the others.
- Hugging Face answers a cross-origin request for both files with
  `access-control-allow-origin` (checked with `curl -I -H "Origin: https://marisstella.app"` on
  the pinned URLs: a 302/307 to its CDN, which answers `*`), so the page can fetch them directly.
  Nothing is uploaded: the photo stays on the visitor's machine, as before.

## Measured: the browser port against the Python engine, val (149 photos)

The same 149 val photos (`receipt_ocr_ru.py`'s labels rebuilt byte for byte), read two ways:

- **Python**: rapidocr-onnxruntime 1.4.4 with `RAPIDOCR_REC_MODEL=eslav.onnx`
  (`eval/rapidocr-photos.py`, the CLI's reader), re-read this run.
- **Page**: `eval/rapidocr-browser.mjs --script=cyrillic` in headless Chromium: the page's own
  `loadRapidEngine({ script: "cyrillic" })`, which started the Web Worker, fetched the four files
  (jsDelivr answered from the npm tarballs, Hugging Face from the pinned files, hashes checked
  by the page), drew each photo on a canvas and read it.

| reading | totals right (of 145) | seller in the text (of 146) | seller taken as the merchant | item names in the text (of 482) |
|---|---|---|---|---|
| Python, East Slavic (the CLI) | 139 | 125 | 117 (80.1%) | 412 |
| **page, East Slavic, headless Chromium** | **139** | **124** | **116 (79.5%)** | **412** |

Rows text identical on 87 of 149 photos; 4,075 of Python's 4,194 lines (97.2%) appear unchanged
in the page's reading. As on the US photos (`rapidocr-web-2026-11-17.md`) the differences are
the browser's JPEG decoder against PIL's, not the pipeline: one slip's seller name falls under the
80% match in the page's reading. The page took 5.5 s a photo here (one WebAssembly thread, the
container's four cores shared with the Python run).

What the page does after the reading is unchanged: RapidOCR's text leads, tesseract.js's four
readings vote behind it (`settleReadings`), the same order the CLI's `--rapidocr --four-pass`
uses, whose Russian scores are in the 2026-11-18 notes. Test was not re-read: nothing here is a
rule fitted to val, and the port's agreement is the claim.

## Reproduce

```
python3 -m venv v && v/bin/pip install pyarrow rapidocr-onnxruntime==1.4.4
R=https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65/languages/eslav
mkdir hf && curl -L -o hf/rec.onnx $R/rec.onnx && curl -L -o hf/dict.txt $R/dict.txt
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/val-00000-of-00001.parquet
v/bin/python -I eval/receipt_ocr_ru.py val-00000-of-00001.parquet val.jsonl photos-val
v/bin/python -I eval/receipt_ocr_ru_names.py val-00000-of-00001.parquet /tmp/names-val.jsonl   # kept out of the repo
mkdir tgz && (cd tgz && npm pack onnxruntime-web@1.20.1 @gutenye/ocr-models@1.4.2)
node eval/rapidocr-browser.mjs photos-val web-val tgz --script=cyrillic --hf=hf
for k in 1 2 3; do OMP_NUM_THREADS=1 RAPIDOCR_REC_MODEL=hf/rec.onnx RAPIDOCR_REC_KEYS=hf/dict.txt v/bin/python eval/rapidocr-photos.py photos-val es-val $k 3 & done; wait
for d in es-val web-val; do node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr $d; node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr $d; done
```

No photo, reading or name from the dataset is in the repository.

## Next

- The page asks the visitor to pick the alphabet. Picking it from the photo (a first read with
  one recogniser, a second with the other when the first finds Cyrillic look-alikes such as
  `ИТОГ` printed as `NTOF`) would save the choice; measure it on val against the 20 / 117 split.
- A second reading of the header crop at a larger scale (the forms note's "What is left").
