---
title: "Moving in-browser OCR to a Web Worker: the receipts tab's freeze goes from 3.3 s to 51 ms"
seo_title: "ONNX Runtime Web in a Web Worker: OCR without freezing the tab"
date: 2026-11-17
description: "ai-bookkeeper's receipt-photo OCR now runs RapidOCR in a Web Worker beside tesseract.js: the same text on 200 photos, 30% faster, and the tab no longer freezes."
tags: [ai-bookkeeper, receipts, ocr, onnx, performance]
---

Earlier today [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s receipts page started
reading photos with RapidOCR (PaddleOCR's models on ONNX Runtime Web), in the visitor's
browser with nothing uploaded. That took photo totals from 155 right to 184 of 196. The catch
was that the page froze. Every model call and every step around it (resizing, finding the text
boxes, cutting out each line, decoding) ran on the page's main thread, so for the 3 to 4
seconds a photo took, no click, keypress or scroll was handled.

That's now fixed. RapidOCR runs in a Web Worker (`rapidocr-worker.mjs`). The page still
decodes and draws the photo, so the pixels are exactly what they were before. It then
*transfers* the pixel buffer to the worker instead of copying it, and the worker hands back
lines of text.

## Same text, no freeze

Measured in headless Chromium on 200 US receipt photos (ExpressExpense's SRD set). Every photo
was read by both paths, and a 10 ms timer on the page recorded the longest gap between its
runs:

| RapidOCR runs in | same text | read time (median) | longest stall (median / worst) |
|---|---|---|---|
| the page's thread (before) | | 3.2 s | 3,216 ms / 6,808 ms |
| **a Web Worker (now)** | **200 of 200** | 3.2 s | **12 ms / 140 ms** |

## A free 30% from running side by side

tesseract.js already had its own worker, but the page waited for one reader to finish before
starting the other. Now both readers download together, and each photo's RapidOCR read starts
before tesseract's four readings and is collected after them. The vote between the five
readings is unchanged. Timing the whole photo read on the first 21 SRD photos:

| page code | settled text | per photo (median) | longest stall (median) |
|---|---|---|---|
| before | | 7.6 s | 3,307 ms |
| **now** | identical on 21 of 21 | **5.3 s** | **51 ms** |

## What's left

- ONNX Runtime still gets one WebAssembly thread. A static page isn't cross-origin isolated,
  so the worker can't use threads of its own.
- A browser without module workers (Firefox before 114, Safari before 15) falls back to the
  old path, and the status line says so.
- All of this was measured headless on one shared 4-core machine, so a phone will be slower.
  Running the two readers side by side only helps with at least two cores, which current
  phones have.

The measurements and how to rerun them are in
[`eval/rapidocr-worker-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/rapidocr-worker-2026-11-17.md).
