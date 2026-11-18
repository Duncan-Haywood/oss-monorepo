# RapidOCR on the page: ONNX Runtime Web (2026-11-17)

The CLI's `receipts --rapidocr` (PR #16823) and `--rapidocr --four-pass` (PR #16832) read a
receipt photo with RapidOCR (PaddleOCR's PP-OCRv4 models through ONNX Runtime) and took SRD
totals from 156 to 181 of 196. The page still read photos with tesseract.js alone. This run
brings RapidOCR to the page.

## What was built

- **`rapidocr-web.mjs`**: a JavaScript port of rapidocr-onnxruntime 1.4.4's pipeline with its
  `config.yaml` defaults: the 2,000 / 30 pixel side limits and letterbox, the detector's resize
  (short side to 736, sides to multiples of 32), DB post-processing (threshold 0.3, 2 x 2
  dilation, 8-connected blobs, minimum-area rectangles, box score 0.5, unclip 1.6), crops by
  perspective warp (bicubic, edges repeated, tall crops turned), the 180-degree classifier
  (batches of 6, 0.9), the recogniser (batches of 6 by width, padded to the widest), CTC
  decoding and the 0.5 text-score cut, then `rapidocr_rows.py`'s rows. Every step but the model
  calls is plain JavaScript over typed arrays; `ort` and the models are passed in.
- Two parts had to be exact rather than close, found by comparing intermediate results with
  the Python on SRD photo 1002:
  - **unclip** is Clipper 6's round-join offset (pyclipper; arc tolerance 0.25, integer input,
    rounded output). A circle-sampled approximation moved 17 of 39 boxes by a pixel and changed
    words; the port of `ClipperOffset.DoRound` makes all 39 identical.
  - **resize** is OpenCV's fixed-point INTER_LINEAR (weights in 2048ths, its vectorised
    vertical rounding). Float bilinear differed by 1 on 12% of pixels and turned "Taco Bel1"
    into "Taco Bell"; the fixed-point version differs on 0.4% and the text matches.
- **The page** (`photoocr.mjs` `loadRapidEngine`, `readPhotos({ rapid })`): with the new
  "also read with RapidOCR" box ticked (the default), each photo is drawn on a canvas and read
  by RapidOCR first, then by tesseract.js's four readings, and all five go to the same vote
  (`settleReadings`), as `--rapidocr --four-pass` does. ONNX Runtime Web 1.20.1 and the models
  come from jsDelivr only when a photo is read with the box ticked. If they cannot load, the
  photos are read by tesseract alone and the status line says why. Usage events:
  `receipt_photos_rapidocr`, `receipt_photos_rapidocr_failed`.
- **Models**: npm's `@gutenye/ocr-models@1.4.2` (MIT package of PaddleOCR's Apache-2.0
  weights). Its three .onnx files have different hashes from the ones in the rapidocr wheel
  but gave outputs equal to the last bit on random inputs (det 1x3x320x256, rec 2x3x48x320,
  cls 2x3x48x192: max difference 0.0), and its `ppocr_keys_v1.txt` equals the character list in
  the wheel's recogniser metadata. Nothing is committed here; about 16 MB is fetched once.

## Results on SRD (196 US receipt photos, ExpressExpense; labels eval/srd/labels.jsonl)

Nothing was tuned on these photos in this run: the only comparisons that drove changes were
the intermediate checks on photo 1002 against the Python engine (not against labels).

**The port against the Python engine** (same photos, rows text):

| reader | photos with identical rows | Python's lines found | totals right | tax right / wrong / none |
|---|---|---|---|---|
| Python RapidOCR (`rapidocr_rows.py`) | | | 179 / 195 | 141 / 7 / 36 |
| port, Node, onnxruntime-node, jpeg-js decoding | 67 / 199 | 3,768 / 4,022 (93.7%) | 179 / 195 | 141 / 7 / 36 |
| port, Node, PIL's decoded pixels (first 41 photos) | 35 / 41 | 830 / 839 (98.9%) | | |
| **port, headless Chromium, onnxruntime-web (WASM), the page's canvas** | **170 / 199** | **3,960 / 4,022 (98.5%)** | **182 / 196** | **146 / 7 / 32** |

(195 / 199: photo 1158 is a PNG named .jpg, which jpeg-js cannot read and which the
comparisons leave out; the browser reads it.) With the same pixels the port gives the Python's
text; most of what differs in Node is jpeg-js decoding JPEGs slightly differently from PIL
(mean 0.63 levels per channel). The browser's decoder is closer to PIL's.

**What the page puts in the receipts box** (`eval/cord-receipts.mjs --settled`), with
tesseract's four readings made by the CLI's code (`eval/srd-cli.mjs`: tesseract 5.3.4, the
shaded-photo passes included):

| page readers | totals right | wrong with no warning | tax right / wrong / none |
|---|---|---|---|
| tesseract four (what the page did before) | 155 / 196 | 4 | 135 / 11 / 39 |
| RapidOCR alone (browser) | 182 / 196 | 14 | 146 / 7 / 32 |
| **RapidOCR (browser) first, then tesseract four (the page now)** | **184 / 196** | 5 | **166 / 9 / 10** |

The page now gets 29 more totals right of 196 and 31 more taxes of 185. RapidOCR alone has no
second reading to disagree with, so it never warns: its 14 wrong totals arrive unflagged.
With tesseract's four after it, 7 of the 12 wrong totals carry a "check it" note.

**Caveat:** the tesseract column is tesseract 5.3.4 (the CLI's), not tesseract.js 5.1.1 in the
browser; the two engines read the same models but are separate builds. The drawn-receipt check
in `eval/photo-ocr-browser.mjs` runs the page itself with both readers end to end.

**Speed:** 3.8 s a photo for RapidOCR in headless Chromium on a shared 4-core container
(single-threaded WASM: a static page is not cross-origin isolated, so ONNX Runtime Web gets one
thread), while tesseract jobs ran beside it. The model calls run on the page's main thread, so
the tab does not respond while a photo is read. Next: move it into a Web Worker.

CORD photos were not re-read: huggingface.co refused this session's proxy (403), and the
photos are fetched from there at run time.

## Reproduce

```
node eval/srd-fetch.mjs $P                                   # 200 SRD photos
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4
# Python rows: rapidocr_rows.py on each photo into $O/py/<id>.txt
mkdir nm && (cd nm && npm i onnxruntime-node@1.20.1 onnxruntime-web@1.20.1 jpeg-js@0.4.4 @gutenye/ocr-models@1.4.2)
node eval/rapidocr-web.mjs $P $O/js nm/node_modules --node   # the port in Node
npm pack onnxruntime-web@1.20.1 @gutenye/ocr-models@1.4.2    # into $TGZ
node eval/rapidocr-browser.mjs $P $O/br $TGZ                 # the port in Chromium
OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O/cli           # tesseract's four
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/br,$O/cli/psm6,$O/cli/psm4,$O/cli/g6,$O/cli/g4 --settled
node eval/photo-ocr-browser.mjs $TGZ_WITH_TESSERACT_TOO      # the page end to end
```

Tests: `rapidocr-web.test.mjs` (14: resize values, rectangles, unclip, dilation and blobs,
post-processing, sorting, crops, CTC, rows, the pipeline over a fake runtime, the page's lead
reading and its fallback).
