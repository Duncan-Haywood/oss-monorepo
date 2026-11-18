# RapidOCR in a Web Worker (2026-11-17)

`eval/rapidocr-web-2026-11-17.md` brought RapidOCR (PaddleOCR's PP-OCRv4 models on ONNX
Runtime Web) to the receipts page and left one problem: the model calls and all the JavaScript
around them (resizes, DB post-processing, perspective crops, CTC decoding) ran on the page's
main thread, so the tab did not respond for the 3 to 4 seconds each photo took. This run moves
that work into a Web Worker.

## What changed

- **`rapidocr-worker.mjs`** (new): a module worker. It imports `ort.min.mjs` (the ES-module
  build of the same onnxruntime-web 1.20.1 the page loaded as `ort.min.js`, same WebAssembly
  file), downloads the three models itself and runs `rapidocr-web.mjs` unchanged. Messages:
  `open` / `ready`, `read {id, width, height, rgba}` / `rows {id, text}`, `error`. The handler
  (`serveRapid`) is a plain function so Node tests drive it with a fake runtime.
- **`photoocr.mjs`**: `loadRapidEngine` starts the worker (`loadRapidWorker`); the page only
  decodes and draws the photo (createImageBitmap, a canvas, getImageData, as before, so the
  pixels are the same) and transfers the RGBA buffer, not a copy. If a worker cannot be
  started or its module cannot load, it falls back to the old path on the page's thread
  (`loadRapidInPage`), and the status line says so; a download failure is not retried there.
  A worker that dies fails its waiting reads instead of hanging.
- **RapidOCR and tesseract.js now run side by side.** Both already had their own thread
  (tesseract.js always used a worker), but `readPhotos` waited for one before starting the
  other. It now loads both readers together, and starts each photo's RapidOCR read before
  tesseract's four readings and collects it after. The vote is unchanged: RapidOCR's reading
  still leads.
- `sw.js` caches the worker file (cache v18). `eval/photo-ocr-browser.mjs` routes requests on
  the browser context so the worker's own downloads are answered, and its RapidOCR check now
  also requires that the read did not fall back to the page's thread.

## How it was checked

Headless Chromium (Playwright's), a shared 4-core container, jsDelivr answered from the npm
tarballs (onnxruntime-web 1.20.1, @gutenye/ocr-models 1.4.2, tesseract.js 5.1.1 and its core
and English data). Photos: SRD's 200 US receipt photos (`eval/srd-fetch.mjs`). "Longest stall"
is the longest gap between two runs of a 10 ms timer on the page's thread while a read was
under way: for that long no click, key or scroll would be handled.

**RapidOCR alone, worker against page thread** (`eval/rapidocr-worker.mjs`; each photo read by
both, one after the other):

| RapidOCR runs in | text identical | read ms, median / p90 | longest stall ms, median / p90 / max |
|---|---|---|---|
| the page's thread (before) | | 3,216 / 4,413 | 3,216 / 4,403 / 6,808 |
| **a Web Worker (now)** | **200 of 200** | **3,205 / 4,373** | **12 / 17 / 140** |

The worker gives the same text on every photo and takes the same time; the page stays
responsive (the 140 ms is one large photo's decode and getImageData, still on the page).

**The whole "Receipt photos" read, old `photoocr.mjs` against new**
(`eval/photo-read-timing.mjs`; RapidOCR then tesseract.js's four readings and the vote, the
first 21 SRD photos, one call per photo, run one after the other):

| page code | settled text | first photo ms | photos 2-21: ms per photo, median / total | longest stall ms, median / max |
|---|---|---|---|---|
| main before this run (in-page RapidOCR, then tesseract) | | 7,668 | 7,603 / 170,835 | 3,307 / 4,606 |
| **this run (worker, side by side)** | **identical on 21 of 21** | **4,988** | **5,326 / 120,196** | **51 / 85** |

A photo now takes about 30% less time from pick to text, because RapidOCR's thread and
tesseract's thread work at once, and the tab's longest stall goes from about 3.3 s to about
50 ms (what is left is tesseract.js's and the canvas's own work on the page).

The page end to end (`eval/photo-ocr-browser.mjs`): a drawn receipt read through the real
"Receipt photos" control with RapidOCR on (in the worker) and off; all checks pass, total
10.62 and tax read.

## Limits

- One machine, headless, a shared container; a phone will be slower in absolute terms. The
  gain from running side by side needs at least two cores, which current phones have.
- ONNX Runtime still gets one WebAssembly thread: the page is not cross-origin isolated (a
  static host without COOP/COEP headers), so threads inside the worker stay off.
- Browsers without module workers (Firefox before 114, Safari before 15) take the fallback and
  stall as before.
- Accuracy is unchanged by design: no labels were scored in this run, only the text compared
  with the old path.
