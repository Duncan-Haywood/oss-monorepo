---
title: "A receipt's \"total paid\" is sometimes just the cash you handed over"
date: 2026-10-26
description: "ai-bookkeeper's receipt reader took the cash tendered as the total on some Malaysian receipts; a change line now settles it. 601 to 604 of 625 on SROIE."
tags: [ai-bookkeeper, receipts, accounting]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipts so they can be matched to bank lines. On 626 real receipts (SROIE 2019) it got 601 of 625 totals right. One cause of the misses: a line like `TOTAL PAID RM50.00` printed under `GRAND TOTAL RM21.85` and `CHANGE RM28.15`. The 50.00 is the cash handed over, and the bank would never see it.

The reader now checks: if the paid amount less the change equals an earlier total line (within 5 cents), that line is the total. Card receipts that print only `TOTAL PAID` are untouched. Result on the same set: 604 of 625 (96.6%), merchant and date unchanged. This was measured on the dataset's word boxes, not on OCR output; I had no tesseract in this session. Estimates only, not accounting advice.
