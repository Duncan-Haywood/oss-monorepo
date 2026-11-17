---
title: "Swapping in a second OCR engine took receipt-photo totals from 59% to 84%"
seo_title: "PP-OCRv4 vs tesseract on receipt photos: CORD and SRD results"
date: 2026-11-17
description: "On 95 held-out receipt photos, adding PP-OCRv4 (run locally via RapidOCR) to tesseract took totals from 56 to 80 right, and taxes from 16 to 32 of 41."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

For two weeks, runs on [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s receipt
reader wrote parsing rules for tesseract's mistakes: "Tota]", "SUB. TOTAL", a 0 read as an 8.
Each rule gained a photo or two. Earlier today a run counted what was left on 600 unseen CORD
receipt photos: on 148 of 221 misses, the total never appears in tesseract's text. No rule
can fix a number the OCR engine never printed.

So we tried another engine. PP-OCRv4 is PaddleOCR's text detection and recognition model
pair (Apache-2.0). RapidOCR packages it for ONNX Runtime, and the 16 MB of models ship
inside the pip wheel. It runs on the user's CPU, uploads nothing, and takes about half a
second a photo. A 64-line script turns its word boxes back into receipt lines, and a new
setting, `RECEIPT_OCR_LEAD`, puts its reading first in the CLI's vote, ahead of tesseract's
four.

The parsing rules didn't change. Totals read right:

| photos | tesseract, four readings | PP-OCR + those four |
|---|---|---|
| 95 held-out CORD test photos (Indonesian, scored once) | 56 (58.9%) | **80 (84.2%)** |
| 196 US receipt photos (ExpressExpense SRD) | 156 (79.6%) | **180 (91.8%)** |
| 583 CORD train photos (where the order was chosen) | 362 (62.1%) | **508 (87.1%)** |

Taxes went from 16 to 32 of 41 on the held-out set and from 135 to 161 of 185 on the US
photos. PP-OCR alone reads about as many totals as the combination. The tesseract readings
earn their place on tax: the combination reads 29 more train taxes than PP-OCR alone.

In hindsight, the lesson is to measure the ceiling before tuning under it. One count ("is the
right number anywhere in the OCR text?") would have shown weeks ago that most misses were
the engine's. We had been spending runs on the other third.

Two limits. The models are trained mostly on Chinese and English, and we tested only
Latin-script receipts. And the web page still reads photos with tesseract.js in the browser.
Moving PP-OCR into the page means onnxruntime-web and a 16 MB model download, which is the
next piece of work.

The full tables, including PP-OCR alone and validation, are in the
[evaluation note](../../ventures/ai-bookkeeper/eval/second-ocr-engine-2026-11-17.md). CORD is
Clova AI's dataset (CC BY 4.0). Photos are read at run time and not stored in the repository.

ai-bookkeeper is a bookkeeping aid, not tax or accounting advice. Check any total it flags.
