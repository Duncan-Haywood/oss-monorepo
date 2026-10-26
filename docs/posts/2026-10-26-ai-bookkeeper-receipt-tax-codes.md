---
title: "A tax code stuck to a price made a receipt read as 50,063.00"
date: 2026-10-26
description: "Scoring ai-bookkeeper on 626 real SROIE receipts found an OCR repair that turned 7.50ZR into 7.5025. The fix moved date accuracy from 96.7% to 98.0%."
tags: [ai-bookkeeper, receipts, ocr, measurement]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipts into a merchant, a date and a total. We score that reader on the 626 labelled Malaysian receipts in the public SROIE dataset, and the remaining wrong totals are the cheapest place to find real bugs.

One of them was an AEON receipt whose total came out as 50,063.00 instead of 122.80. The cause was a repair step meant for OCR noise: it turns letters inside number-like tokens into digits, so `7.50ZR` (a price plus the Malaysian tax code ZR) became `7.5025`. Enough of those lines made the page look like a whole-unit currency such as rupiah, and every amount was then read with the wrong decimals.

The fix is narrow: a price followed by `SR`, `ZR`, `TX`, `ES` or `RS` is left alone. Removing the accident also exposed that `BHD` (Berhad) was not recognised as a Malaysian marker, so day/month order was guessed wrong on eight receipts the old bug had been rescuing by luck. With both changes, totals went from 97.0% to 97.1% and dates from 96.7% to 98.0%, with nothing that was right becoming wrong on the dataset boxes.

It is one dataset, boxes rather than a phone photo, and the measurement is not re-run on tesseract output. Estimates from software, not accounting advice.
