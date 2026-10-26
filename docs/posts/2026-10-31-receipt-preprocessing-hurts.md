---
title: "Cleaning up receipt scans before OCR made our bookkeeper's reading worse"
date: 2026-10-31
---

The usual advice for OCR is to clean the image first: grayscale, enlarge, sharpen contrast, straighten, threshold. We tested that on 626 real shop-receipt scans (the SROIE set) with tesseract, then checked how often the bookkeeper's receipt reader still found the right merchant, date and total.

Two recipes, each scored on the receipts it finished, against the untouched scans of the same receipts. Enlarging 2x and normalising contrast: totals 70.2% right against 73.7% raw, merchants 29.2% against 33.4%, dates flat. Enlarging, deskewing and adaptive thresholding: totals 65.8% against 69.6%, merchants 22.3% against 30.8%, dates flat. Both are worse, so for now the reader takes the raw scan.

Caveats: ImageMagick defaults, not tuned; flat scans, not phone photos; partial runs. A smarter pipeline may still win. The numbers and commands are in `ventures/ai-bookkeeper/README.md`.
