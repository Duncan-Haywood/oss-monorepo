---
title: "We ran 626 real receipt photos through tesseract. The totals dropped from 96% to 75%."
date: 2026-10-26
description: "Scoring ai-bookkeeper's receipt reader on real tesseract output for 626 SROIE receipts drops total accuracy from 96% to 75%; three faults fixed along the way."
tags: [ai-bookkeeper, receipts, evaluation]
---

ai-bookkeeper's receipt reader had only ever been scored on text that a dataset's authors had boxed and typed by hand. That is the best case. This week I ran tesseract 5.3.4 over all 626 SROIE shop-receipt scans and scored the same reader on the same hand labels.

| | from hand-made boxes | from tesseract text |
|---|---|---|
| merchant, exact | 63.7% | 33.1% |
| date | 96.7% | 77.6% |
| total | 96.2% | 74.9% (72.2% before the fixes) |

Most of the drop is the OCR engine: logos read as noise, one wrong digit in an amount, a year read as 2048. Three faults were in our reader and are fixed. A total row such as `Total : 140.00 8.40`, with the last column cut off, took the tax for the total. A clock printed as `Time: 12-49-00` was counted as month-first evidence and left a `13/03/2018` receipt with no date. A stamped lower-case name above the shop name was taken for the merchant.

Next is a preprocessing pass (deskew, threshold) measured against these numbers, then phone photos, which SROIE's flat scans are not. The eval is `eval/sroie-receipts.mjs --ocr DIR` in `ventures/ai-bookkeeper`; the images are fetched at run time and never copied.
