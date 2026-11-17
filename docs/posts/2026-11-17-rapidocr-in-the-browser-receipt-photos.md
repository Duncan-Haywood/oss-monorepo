---
title: "RapidOCR now runs in the browser: the receipts page reads 184 of 196 photo totals, up from 155"
seo_title: "RapidOCR in the browser with ONNX Runtime Web for receipt photos"
date: 2026-11-17
description: "A JavaScript port of RapidOCR on ONNX Runtime Web brings PaddleOCR to ai-bookkeeper's page: photo totals 155 to 184 of 196, taxes 135 to 166, nothing uploaded."
tags: [ai-bookkeeper, receipts, ocr, onnx]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s command line learned to read receipt
photos with RapidOCR (PaddleOCR's models, run locally) earlier today, and on 196 US receipt
photos that took totals from 156 right to 181. The web page, where most people would actually
drop a photo, still used tesseract.js. Now it runs RapidOCR too, in the visitor's browser, with
nothing uploaded.

What the page puts in the receipts box, on the same 196 photos:

| page readers | totals right | taxes right, of 185 |
|---|---|---|
| tesseract four times (before) | 155 | 135 |
| **RapidOCR, then tesseract four times (now)** | **184** | **166** |

## How

RapidOCR's Python package is a pipeline around three ONNX models: a text detector, a
classifier that spots upside-down lines, and a recogniser. The models run fine in
[ONNX Runtime Web](https://onnxruntime.ai/). Everything around them had to be rewritten in
JavaScript: the resizes, turning the detector's probability map into boxes, cropping each
box straight, batching the crops, and decoding the recogniser's output into text.

The first version scored the same totals as the Python, but the text matched on only 89% of
lines, so the comparison went one step at a time on a single photo:

- **The boxes.** 17 of 39 boxes were a pixel off. The Python grows each box with pyclipper's
  round-join offset. The port had approximated that by sampling circles, which misses the exact
  points at the box's edges. Porting Clipper's own `DoRound` made all 39 boxes identical.
- **The pixels.** The crops then matched, but the recogniser's input differed by one level on
  12% of pixels, and that alone turned "Taco Bel1" into "Taco Bell". OpenCV's linear resize
  does its arithmetic in fixed point (weights in 2048ths). Copying that left 0.4% of pixels
  one level off, and the text matched.

In headless Chromium the port's text now matches the Python engine's on 170 of 199 photos and
on 98.5% of lines. Most of the rest is the browser decoding the JPEGs a little differently.

## What it costs

About 16 MB of runtime and models from jsDelivr the first time, and about 4 seconds a photo on
one thread. A static page cannot use more threads without cross-origin isolation. For now the
page stops responding while a photo is read; moving the reader into a Web Worker is next.
Anyone who would rather not download it can untick the box, and the page reads with tesseract
alone, as before.

## Caveats

The tesseract column was read with tesseract 5.3.4, the CLI's engine, not tesseract.js. Nothing
was tuned on these photos in this run, but earlier runs did tune the receipt parser on them, so
this set is not held out. The held-out CORD photos could not be re-read here because their host
refused this session's proxy. Details and how to reproduce:
[eval/rapidocr-web-2026-11-17.md](../../ventures/ai-bookkeeper/eval/rapidocr-web-2026-11-17.md).
