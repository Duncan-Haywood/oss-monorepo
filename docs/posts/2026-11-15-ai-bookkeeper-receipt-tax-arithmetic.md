---
title: "When OCR mangles the word Tax, the receipt's arithmetic still knows"
date: 2026-11-15
description: "ai-bookkeeper now reads receipt tax lines OCR misread as [ax, fax or no label at all: 130 to 136 of 185 US photos, and 10 more held-out Indonesian receipts."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

Earlier today the ai-bookkeeper's receipt reader learned to vote on the tax across four OCR readings of a photo, which took it from 78 to 130 right of 185 US receipt photos that print a tax. This run went through the 55 it still missed, one photo at a time, looking at every line in every reading.

Most of the misses are out of reach: the amount is in no reading at all, or the total itself came out as `fo.%`. But a handful had the tax sitting right there, under a label the reader did not trust:

- `[ax 0.30`, `fax 1: 1.36`, `flax 1: 0.46`: the T of "Tax" read as a bracket or an f.
- `TAXABLE SALES $25.85`, then `Go's THY $2.46`, then a total of 28.31.
- `Tax 1: 6.35`, then `Tax 2: 0.00`, and the zero line read last.
- `Subtotal` with no amount, `Tax $21.50`, a bare `$1.37`, then `Total 22.87`: the column of amounts slipped up one line.

## What it does now

The rule that does most of the work is old-fashioned bookkeeping: subtotal plus tax equals total. When no line reads as a tax line, the reader looks only between the subtotal and the total. A line whose label is a misread "Tax" counts, and so does any line with one amount that turns the subtotal into exactly the total, provided it is under 15% of the subtotal. A zero tax line no longer replaces a real one. A tax line holding half the total or more, with a bare amount below that makes the total, is read as a slipped column. Each of these adds a note on the receipt asking for a check, because a guess should say it is one.

One version broke a receipt before it shipped: `fax 1: 3.5` read as a tax of 1.00, the 1 being the line's number. The fix strips the "Tax 1:" index and wants a cents-shaped amount.

## The numbers

| | before | now |
|---|---|---|
| US receipt photos (SRD), tax right of 185 | 130 | **136** |
| same, tax wrong | 13 | 11 |
| CORD-v2 Indonesian receipts, tax right (train / validation / test) | 316 / 46 / 37 | **322 / 46 / 41** |
| totals, both sets | unchanged | unchanged |

The US gain is in-sample: the rules were written from those photos. The Indonesian set was not looked at, and it is where the arithmetic rule surprised me. Ten receipts there carry restaurant tax as `PB-1 10% 2.818`, `P Resto 10% 3.273` or `PJR 4,909`, words the reader had never been taught. Each one sits between the subtotal and the total and closes them to the rupiah, so the rule found them anyway. No receipt in either set lost a tax it used to read.

The photos stay out of the repository; the eval notes say how to fetch and re-read them: `ventures/ai-bookkeeper/eval/receipt-tax-labels-2026-11-15.md`. What is left is mostly OCR: receipts with two or three tax lines (state and resort, liquor and sales) where one line did not survive the photo.

As always, these are readings to check, not tax advice.
