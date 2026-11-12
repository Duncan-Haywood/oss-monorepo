---
title: "Reading US receipt photos: what the OCR loses, and reading twice more"
seo_title: "Receipt photo OCR on 200 US receipts"
date: 2026-11-12
description: "On 200 real US receipt photos, the ai-bookkeeper's in-browser reader got 60.7% of totals right. Four readings and a vote took it to 68.4%, and wrong totals with no warning fell from 8 to 3."
tags: [ai-bookkeeper, evaluation, ocr, receipts]
---

The ai-bookkeeper can read a receipt photo in the browser. The image is never uploaded: tesseract.js, a WebAssembly build of the Tesseract OCR engine, reads it on your machine, and the text goes into a box you can correct before the receipt is filed. Earlier runs measured that reader on Malaysian scans (SROIE) and Indonesian phone photos (CORD). Neither is what a US small business photographs: a long thermal-paper slip from a restaurant or a hardware store, curled, held in a hand.

ExpressExpense gives away 200 photos of exactly that as a free OCR dataset. 187 are US receipts in dollars; the rest come from Europe, Canada, India and elsewhere. They carry no labels, so the first job was writing them. Four agent sessions each read 50 photos by eye, working from the photos alone with no OCR output in front of them. Each recorded the last printed amount charged (never a handwritten tip), the subtotal and the tax. Receipts check themselves: on 172 receipts with a subtotal and tax, 146 add up exactly. Each of the other 26 has a printed reason, such as a service charge, a printed tip, a discount or a split check. The labels are in the repository, and the photos are fetched at run time.

## What the reader got right

| 196 labelled totals | Right | Wrong, page warned | Wrong, no warning |
|---|---|---|---|
| the page before (two readings) | 119 (60.7%) | 65 | 8 |
| the page now (four readings, a vote) | 134 (68.4%) | 57 | 3 |

The more useful finding is where the misses come from. On half the photos, 40 totals were wrong. On only 7 of those was the right amount anywhere in the OCR text. The other 33 were lost before the reader saw any text. US point-of-sale printers print the total in a big double-height font, and that is the line tesseract drops most often. The bottom of a curled slip, where the total sits, often comes out as noise. Better parsing rules can't recover a number that isn't in the text. One rule I tried fixed one receipt and broke another, so it was not shipped.

## Reading more

What helped was giving the OCR more chances. The page already read each photo twice, in two of tesseract's layout modes. It now also draws a grey copy at twice the size on a canvas and reads that in both modes too. Across the four readings, the right total turned up on 146 of 196 photos, against 126 from the original two. Choosing among them is a vote. Each candidate total gets one point for each kind of arithmetic check that confirms it (subtotal plus tax, cash less change, the items added up), one for each reading that found it, and one more for each reading that printed it on a total line. The weights were picked on the even-numbered photos and scored once on the odd ones, where the score went from 60 to 66 of 97.

SROIE_POST_PLACEHOLDER

## What it doesn't do

Two-thirds is not good enough to trust blindly, and the page doesn't ask you to. When a total was guessed, or the readings disagreed, the status line says so. Only 3 of the 196 came back wrong with no warning. The extra readings run only on photos under 2,000 pixels; a full-size phone photo is still read twice, because enlarging was only measured on small ones. A small photo now takes about twice as long to read. Next is the curled slip itself: flattening the photo before OCR, and testing full-size phone photos.

The method, the labels and every number are in the ai-bookkeeper README, under "US receipt photos".
