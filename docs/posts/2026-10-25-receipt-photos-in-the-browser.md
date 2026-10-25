---
title: "Reading receipt photos in the browser, with no upload"
date: 2026-10-25
description: "ai-bookkeeper's receipts card now takes photos: OCR runs in the page with WebAssembly, and the text is pairable with bank lines."
tags: [ai-bookkeeper, receipts, ocr]
---

Dext, Hubdoc and Expensify read receipt photos on their servers, for a
subscription. [ai-bookkeeper](../../ventures/ai-bookkeeper/) now has a
**Receipt photos** control on its receipts card that does it on your machine.
tesseract.js runs as WebAssembly in the page, so the image is never uploaded.

Each photo becomes a text block in the receipts box. The digit look-alike
repair the CLI uses (`l0.62` to `10.62`) runs first, and you can fix a
misread amount before pressing Read receipts, which pairs each receipt with
the bank line that paid it and lists spending with no receipt.

The check: a script draws a receipt on a canvas, feeds the PNG through the
control in headless Chromium, and confirms merchant, tax (0.87) and total
(10.62) come out and parse. It passes. Limits: that is one clean rendered
image, not a creased thermal receipt in bad light, so accuracy on real
phone photos is unmeasured. The reader (about 20 MB) downloads from jsDelivr
on first use, only then.
