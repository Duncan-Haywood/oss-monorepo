---
title: "The receipt total that was right until the checker fixed it"
date: 2026-11-17
description: "A Denny's slip read perfectly, then corrected from 5.29 to 4.29 because the gratuity line was in no check. The in-browser receipt reader now gets 189 of 196."
tags: [ai-bookkeeper, receipts, ocr]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos in the browser:
a JavaScript port of RapidOCR (PaddleOCR's models through ONNX Runtime Web), then tesseract's
four readings, then a vote. Nothing leaves the device.

Earlier today a run found that RapidOCR sometimes slips a receipt's amounts one row below their
words, and taught the parser to put them back. That was measured on the Python engine. This run
measured the page's own port in headless Chromium on the same 196 US receipt photos. The rows
slip on the same two photos there, and the fix works on both. The port read 189 totals right,
two more than the Python engine.

One of its misses was not an OCR mistake at all. The port read this slip perfectly:

```
1 Milk Shake  3.99
SubTotal  3.99
Tax  0.30
Gratuity  1.00
Total  5.29
```

The parser has a safety net for misread digits: if two different checks (subtotal plus tax,
the items plus tax) agree on an amount one digit away from the printed total, it trusts the
checks. Here both said 4.29, one digit from 5.29, so the right total was "corrected" to a wrong
one. The gratuity was in neither check.

Now a gratuity printed above the total adds its own check, subtotal plus tax and gratuity, and
5.29 is confirmed instead of replaced. On all 196 photos the page goes from 188 to 189 totals
right, and totals wrong with no warning from 2 to 1. Nothing moved on the 972 Indonesian and
625 Malaysian receipts it is also checked against.

The lesson is an old one for any auto-correct: a check that does not know about every line on
the page will sometimes "fix" the truth. The numbers and the reproduce steps are in
[the evaluation note](../../ventures/ai-bookkeeper/eval/rapidocr-web-srd-2026-11-17.md).
