---
title: "Our receipt reader got the tax right on 42% of phone photos. Letting four readings vote took it to 70%"
seo_title: "Reading sales tax from receipt photos: 42% to 70% right"
date: 2026-11-15
tags: [ai-bookkeeper, ocr, receipts, sales-tax, tesseract, bookkeeping, open-source]
description: "We had tuned the total on 196 real US receipt photos for weeks and never measured the tax. It was 42% right. Reading every tax line and voting took it to 70%."
---

The open-source bookkeeper in this repository reads receipt photos in the browser. It
reads each photo four times with tesseract.js (two layout modes, on the photo and on a grey
copy), and the four readings vote on the total. Over the last week, runs here moved the
total on ExpressExpense's 196 free US receipt photos from 60% to 79.6% right.

Nobody had measured the tax. The eval script already counted it, though, and the number
was poor: **78 of the 185 photos that print a tax, 42.2%.** It left 92 empty.

## Where the misses were

A script sorted each missed photo by where the right amount turned up in the four
readings:

| where the right tax was | photos |
|---|---|
| another reading had already parsed it, but the page only used the first reading | 31 |
| in the text, but nothing could read it | 33 |
| nowhere: OCR never produced it | 32 |

So two thirds of the misses were not OCR failures. The text in the second group is the
kind you see on any US restaurant slip:

- `Tax:: $0.70`, then `Sbt1 w/Tax: $10.70` on the next line. The reader took the last
  line with "tax" in it, saw that its amount equalled the total, and threw the tax away.
- `Taxes: 3.85`. The pattern matched "tax" as a whole word, so "Taxes" didn't count.
- `Tax 8.75% 1.11`. The rate was read as the amount.
- `TXTL .75`, `HI ... 4.712% GET 1.86` (Hawaii's general excise tax), `Tax 12,94` with
  OCR's comma for a point.

## What changed

The reader now treats every tax line as a candidate. It strips the rate printed next to
the amount and skips "Taxable" and "w/Tax" lines. A printed "Total Tax" line wins. When a
slip shows state tax and resort tax on separate lines, it adds them, but only if the
subtotal plus their sum is exactly the total.

Across the four readings, each tax gets one vote per reading that found it. It gets two
more when some reading's subtotal plus that tax equals the total. A tax one digit away
from total minus subtotal becomes that difference ("Tax: 8.21" when 42.16 minus 38.95 is
3.21). The page then writes the winning tax into the receipts box and says so on the
photo's line, so you can see what to check.

| 185 US receipt photos with a tax | before | after |
|---|---|---|
| tax right | 78 (42.2%) | **130 (70.3%)** |
| tax wrong | 15 | 13 |
| totals right (196 photos) | 156 | 156 |

On a second dataset, 404 Indonesian receipts from CORD read from their hand-corrected text,
the tax score didn't move (316, 46 and 37 across its three splits). Two shapes that set
caught while we were writing this ("Tax IDR 19,635" and "Total Tax Included") are covered by
tests now.

## The caveat

We split the photos into even and odd numbers and tuned on one half. That doesn't make
the odd half a clean held-out test, because our first listing of misses showed photos
from both halves. The odd half went from 38 to 67 right and the even half from 40 to 63,
which suggests the gain isn't a fit to a few photos. A fresh set of receipts is the real
test, and we don't have one yet.

What's left: 28 photos where OCR never produced the tax, and slips with two or three tax
lines where OCR lost one of them. Code, tests and per-photo numbers are in
`ventures/ai-bookkeeper` (`eval/receipt-tax-2026-11-15.md`).
