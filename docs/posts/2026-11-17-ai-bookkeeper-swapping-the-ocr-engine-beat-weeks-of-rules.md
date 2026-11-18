---
title: "Swapping the OCR engine beat weeks of parser rules on receipt photos"
seo_title: "RapidOCR vs tesseract on receipt photos: totals read right"
date: 2026-11-17
description: "Weeks of rules got tesseract to 58% on unseen receipt photos. A local PaddleOCR model via RapidOCR reads 84% with no rule changed. What failed first."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the total and the tax. Until today it did that with tesseract. Each photo
was read four times (two page modes, on the photo and on a grey copy), and then a stack of
rules picked the total by letting the receipt's own arithmetic vote: cash less change,
subtotal plus tax, a subtotal at Indonesia's 10% restaurant tax. Most of those rules came from
studying wrong answers, one receipt at a time, across dozens of runs.

On phone photos the rules never saw, that came to about 58%. CORD's held-out test set read
55 of 95 totals right (57.9%).

## The idea that failed

Yesterday's note on that work said that in 49 of the 81 misses on our development photos, the
total was not in any of the four readings. No rule can fix a number the OCR never printed.
The suggestion was to read once more, cropped to the bottom third of the receipt, where the
total usually is.

It recovered 1 total in 146 photos. Five image treatments (contrast stretch, single colour
channels for tinted paper, a local threshold for faded print) recovered at most 3 of the 49.

Looking at the photos showed why. The totals were not cut off. The receipts were faded thermal
paper, blue or pink stock, a slip small in a busy frame, a curled strip held in a hand.
Tesseract does not read those, and cropping or recolouring them does not change that.

## Changing the engine

[RapidOCR](https://github.com/RapidAI/RapidOCR) packages PaddleOCR's text detection and
recognition models for ONNX Runtime. It installs with pip, runs on the CPU, needs no network
once installed, and is Apache-2.0. We added a small script that turns its word boxes into rows
of text, the way tesseract prints a page, and gave the CLI a `--rapidocr` flag. The parser was
left untouched. Every rule in it was written for tesseract's mistakes.

Totals read right, one RapidOCR reading against tesseract's four readings and their vote:

| photos | tesseract ×4 | RapidOCR ×1 |
|---|---|---|
| CORD train, 196 (where the old rules were written) | 122 | **172** |
| CORD validation, 98 | 70 | **83** |
| CORD test, 95, held out | 55 | **80** |
| US receipts (ExpressExpense), 196 | 156 | **180** |

Nothing about RapidOCR was tuned on these photos, so all four rows are an honest test of the
change. It holds on Indonesian and US receipts alike, and the tax improves as well (CORD test
16 to 28 of 41).

## What we take from it

**Check whether the reader is the bottleneck before you write more rules.** The rules weren't
wasted: they still run on RapidOCR's text, and they are why one clean reading parses as well
as it does. But the cheapest test, swapping the engine and keeping everything else the same,
moved the held-out number more than all of those runs put together.

The work left has changed shape too. On RapidOCR's readings the misses are mostly the
parser's now. With no total line, the cash handed over gets taken as the total. `Rp57,000`
written as one word is read as 57.00. Those are fixable, and they are the next items.

Running a model is slower than tesseract, at about 3.6 seconds a photo on one core, and the
install is around 50 MB. The browser page still uses tesseract.js. The same models run in ONNX
Runtime Web, so the page is the next place to try them.

Numbers, method and every command: [`eval/rapidocr-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/rapidocr-2026-11-17.md).
The photos are CORD-v2 (Clova AI, CC BY 4.0) and ExpressExpense's sample receipts. None of
them are copied into the repository.
