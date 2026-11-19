---
title: "Russian receipts in the browser: a Cyrillic OCR model, hash-pinned, read on your machine"
seo_title: "Russian receipt OCR in the browser with a Cyrillic model"
date: 2026-11-19
description: "The bookkeeper's page now reads Russian receipt photos with a Cyrillic recogniser in the browser: sellers 116 of 146 on val, the CLI's 117."
tags: [ai-bookkeeper, receipts, ocr, browser]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own machine
and matches each one to a bank line by merchant, date and total. Since yesterday its command-line
reader has handled Russian slips with a Cyrillic recogniser, and the seller rules now pick the
shop on 117 of 146 development slips
([post](2026-11-19-ai-bookkeeper-misread-legal-forms-on-russian-receipts.md)). The web page did
not have that recogniser. Its OCR still loaded only the default Latin and Chinese model, so in the
browser a Russian slip got its total but almost never its seller.

## What changed on the page

Next to "also read with RapidOCR" there is now a **RapidOCR alphabet** choice: Latin (the default)
or Cyrillic, for Russian, Ukrainian, Belarusian and Bulgarian receipts. Cyrillic swaps in
PaddleOCR's East Slavic recogniser (Apache-2.0, 7.9 MB). The detector stays the same.

That model is not on npm, where the page gets its other models, so it comes from Hugging Face.
Hugging Face answers cross-origin requests for it, so the page can fetch it directly. Two
precautions:

- The URL names a fixed revision (a commit hash), not `main`, so a later upload cannot change
  what the page loads.
- The page computes the SHA-256 of both files (the model and its character list) and refuses
  them unless they match the hashes recorded when the model was first measured. A swapped file
  gives an error saying so. It is never used.

Your photo is still never uploaded. The model comes to your browser, and the reading happens
there, in a Web Worker so the tab keeps responding.

## Does the browser read as well as the command line?

The browser runs a JavaScript port of the Python OCR pipeline, so the question is whether the port
holds up with a different recogniser. We read the 149 development slips both ways: the CLI's
Python engine, and the page's own loader in headless Chromium (worker, canvas and all).

| reading | totals right (of 145) | seller taken as the merchant (of 146) | item names in the text (of 482) |
|---|---|---|---|
| command line (Python) | 139 | 117 | 412 |
| page (browser) | 139 | 116 | 412 |

The rows of text matched exactly on 87 photos. 97.2% of the Python reading's lines appear
unchanged in the browser's. Most of the gap is the browser's JPEG decoder producing slightly
different pixels from Python's, as we found on US receipts. That cost one seller name. The Latin
model takes the seller on about 20 of these slips, so for a Russian receipt the choice matters.

## What is next

The page asks you to pick the alphabet. It could pick it from the photo instead: read once, and if
the text is full of Latin look-alikes of Cyrillic words (`NTOF` for `ИТОГ`), read again with the
other model. That needs measuring before it ships. Method, hashes and how to reproduce:
[`eval/receipt-ocr-ru-page-2026-11-19.md`](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-page-2026-11-19.md).
