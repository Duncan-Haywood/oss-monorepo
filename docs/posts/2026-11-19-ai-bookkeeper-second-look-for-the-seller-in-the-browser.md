---
title: "A second look for the seller, now in the browser: Russian receipts 105 to 114 of 146"
seo_title: "Reading a Russian receipt's seller in the browser"
date: 2026-11-19
tags: [ai-bookkeeper, ocr, receipts, browser]
description: "When a Russian receipt photo's first OCR reading has no seller, the page now reads three enlarged bands of it. Held-out sellers went from 105 to 114 of 146."
---

[AI Bookkeeper](/ai-bookkeeper/) reads receipt photos on your own computer
and matches them to your bank lines. Nothing is uploaded. To match a receipt
it needs the total, the date and who you paid.

On a Russian fiscal receipt, who you paid is the seller's legal name: ИП
Петров, ООО "Ромашка". That name is often printed small, and not always at
the top. Many receipts put it in the fiscal block under the items. At the
photo's own size, the text detector sometimes misses it completely.

Earlier today the command-line reader learned to take a second look. When
the first reading names no seller, it reads the photo again as three
overlapping horizontal bands, top, middle and foot, each enlarged twice. If
it finds a seller there, that seller leads the text. Everything else still
comes from the first reading. The web page didn't do this yet. Now it does.

## How the page does it

The page runs a JavaScript port of RapidOCR in a background worker. For the
second look it draws each band on a canvas and hands the pixels to the same
reader. One detail saves memory. The command line enlarges each band twice,
and then RapidOCR shrinks anything over 2,000 pixels on its long side before
it looks for text. So the page draws each band at that final size straight
away. The detector gets the same size, and no canvas twice the size of a
phone photo is ever made.

The second look runs only when a slip reads as Russian and the first reading
has no seller. A receipt that already names its seller, and every Latin
receipt, is read once as before.

## How it did

We used the 300 labelled Russian receipt photos in the public
cdek-ocr/receipt-ocr-ru dataset and read them in headless Chromium with the
page's own code:

| split | read again | seller right, before | after | lost |
| --- | --- | --- | --- | --- |
| val (used for development) | 21 of 149 | 116 of 146 | 121 | 0 |
| test (held out, scored once) | 35 of 151 | 105 of 146 | 114 | 0 |

Each of the 14 sellers the bands put first was right, and no total changed.
The page now matches the command line to within one receipt on each split.
That last receipt comes down to the browser and Python decoding the same
JPEG slightly differently.

## A loose end that was already tied

The same flagship list had an older item: a Dubai restaurant receipt whose
VAT line RapidOCR read as `VAT5%: 668`. It looked like a lost decimal point.
It isn't one. The digits themselves are wrong, because the printed amount is
8.99. Splitting the 189.00 total at 5% gives 9.00, which is a cent out,
because this restaurant worked out its VAT line by line. The fix was already
in place: the page and the command line read every photo with tesseract four
more times, and two of those readings print `VAT 5%: 8.99`. The vote takes
that and says the readings disagreed. We crossed the item off.

The details and the commands to reproduce both are in the
[write-up](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/ai-bookkeeper/eval/receipt-ocr-ru-page-bands-2026-11-19.md).
