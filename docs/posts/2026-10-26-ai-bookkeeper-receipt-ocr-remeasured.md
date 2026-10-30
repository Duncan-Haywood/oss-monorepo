---
title: "Receipt shop names from real OCR: 37% to 43% after one small fix"
date: 2026-10-26
description: "Tesseract on 626 real shop receipts: the AI bookkeeper's merchant reader gains 6.7 points from a bracket fix, plus a failed attempt to gain more."
tags: [ai-bookkeeper, ocr, receipts, measurement]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads a merchant, date and total from receipt text. A fix that strips bracketed company numbers (`AEON CO. (M) BHD (126926-H)`) lifted merchant accuracy from 63.6% to 83.2% on the dataset's hand-corrected word boxes, but it had not been run on what a real OCR engine prints.

Run on the same 626 SROIE scans with tesseract 5.3.4 (`--psm 6`, no preprocessing): merchant exact **36.6% to 43.3%** (229 to 271 receipts). Date (77.6%) and total (74.9%) did not move. Most of the remaining misses are OCR-bound: logos read as noise, or no usable line.

A second try, skipping title lines like `See SIMPLIFIED TAX INVOICE` and stripping a stray leading digit, changed nothing on tesseract text and cost 33 receipts on boxes (`99 SPEED MART` lost its 99). It was dropped. The numbers are in the venture README; the data is Malaysian flat scans, not phone photos, which is still the open question. Estimates only, not accounting advice.
