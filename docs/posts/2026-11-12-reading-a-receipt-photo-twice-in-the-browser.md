---
title: "Reading a receipt photo twice in the browser, and letting the receipt check itself"
seo_title: "Receipt OCR in the browser: two readings settled by the receipt's own sums"
date: 2026-11-12
tags: [ai-bookkeeper, ventures, ocr]
description: "The bookkeeper page now reads each receipt photo twice with tesseract.js. On 626 real SROIE scans, totals went from 78.4% right to 79.8%."
---

The [AI bookkeeper](https://marisstella.app/ai-bookkeeper/) can read receipt photos inside your browser. The image never leaves the machine. Until today it read each photo once. The command-line version already had a `--two-pass` switch: read the photo twice in two layout modes, and when the two readings disagree on the total, believe the one the receipt's own sums back up. A receipt states its total more than once. Cash handed over less change is one check. Subtotal plus tax is another. The items added up is a third.

Now the page does the same thing. This was also the first time anyone measured the page's own reader.

## The page's engine, measured

The page uses tesseract.js, the WebAssembly build of tesseract. Earlier numbers came from the tesseract program the CLI calls, which isn't the same engine. So we ran tesseract.js 5.1.1 in Node with the same English model the page downloads. The input was all 626 scans in SROIE, a public set of Malaysian shop receipts whose totals were labelled by hand.

| tesseract.js on 625 labelled totals | Right |
|---|---|
| one reading, block mode (what the page did) | 490 (78.4%) |
| column mode alone | 447 (71.5%) |
| both, settled by the receipt's sums | **499 (79.8%)** |

The second reading changed 14 totals. Ten went from wrong to right and one went from right to wrong. Three went from one wrong number to another. All 14 are flagged on the page with a line asking you to check the total. Either reading had the right total on 514 receipts, so even a perfect way of choosing between them would top out at 82.2%. Past that point the digit is wrong in both readings.

The page's engine also beat the binary slightly: 78.4% against 76.2% in the same mode.

## The box is text, so only one reading fits

The bookkeeper puts what it reads into a text box you can edit before pressing *Read receipts*. Two readings can't both go in the box. The page keeps the first reading and swaps in only the total line the sums back up. Then it checks that the edited text really reads as that total. Scored as the text that ends up in the box, the result matches the two-reading score on every receipt.

## A bug the dataset found

Scan 427 is a 35-megapixel image, and tesseract.js can't load it. Before this change, one photo like that threw away the whole batch you had picked. The reader also raised an uncaught error on top of rejecting. Now that photo is listed as skipped, with the reason, and the others are read.

## What this doesn't show

These are flat scans, not phone photos of crumpled thermal paper. Those are the next test. Reading twice also takes twice as long, about a second and a half per reading per core here. The numbers, the script and how to reproduce them are in the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper#the-page-reads-each-photo-twice-2026-11-12). As always, the bookkeeper is a reading aid. Check the totals it gives you.
