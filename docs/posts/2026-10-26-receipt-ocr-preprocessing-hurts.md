---
title: "We tried cleaning up receipt scans before OCR. It made the books worse."
date: 2026-10-26
description: "Grayscale, upscaling and thresholding before Tesseract cut receipt totals from 74.9% to as low as 56% right on 626 SROIE scans."
tags: [ai-bookkeeper, ocr, receipts]
---

The usual advice for reading receipts with Tesseract is to clean the image first: grayscale, enlarge, threshold. We tested that on the 626 labelled receipts in the public SROIE set, scoring what our bookkeeping tool actually needs: the merchant, the date and the total.

With no preprocessing, the total was right on 74.9% of receipts, the date on 77.6% and the merchant on 33.1%. Grayscale alone dropped those to 71.4%, 73.8% and 29.1%. Enlarging 2x and then thresholding dropped totals to about 62% and dates to 68%. The enlarged versions mostly lost lines outright: 79 to 81 receipts ended up with no merchant at all, against 8 before.

So for clean flat scans, leave the image alone. This does not say anything about phone photos, which are crooked, shadowed and blurry, and where preprocessing is likely to matter. We don't have labelled phone photos yet; that's the next test. Numbers and method are in the ai-bookkeeper README.
