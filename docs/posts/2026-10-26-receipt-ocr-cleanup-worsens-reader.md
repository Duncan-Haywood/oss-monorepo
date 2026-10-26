---
title: "Cleaning up receipt scans before OCR made our receipt reader worse"
date: 2026-10-26
description: "Deskew, grayscale and upscaling before OCR lowered receipt-total accuracy on real SROIE scans; nothing ships, and phone photos remain untested."
tags: [ai-bookkeeper, ocr, receipts]
---

The bookkeeper reads receipts: merchant, date and total. On 626 real shop-receipt scans (the public SROIE set), raw Tesseract output gave the right total 74.9% of the time. The obvious next move is to clean the image first. (Another run reached the same result for the upscale passes the same day; I added deskew.) I tried three: grayscale, 2x upscale and normalise; the same plus a local threshold; and deskew alone.

All three lost. Grayscale and upscale dropped totals to 61.4% and dates to 67.8% across the full set. On the first 291 receipts, deskew alone took totals from 71.4% to 67.2%, and the threshold version to 56.0%. The extra misses are mostly receipts where nothing was read at all. These scans are already flat and clean, so the step only adds artefacts.

So nothing ships. This says nothing about phone photos, which are tilted and shadowed and where deskew may well pay; no public set of those was at hand, so that is the open item. The script to rerun the comparison is `ventures/ai-bookkeeper/eval/sroie-ocr-variants.sh`. One practical note from it: running four Tesseract processes on four cores with its default threading was about 50 times slower than one thread each.
