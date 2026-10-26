---
title: "A parking ticket's cash line is not its total"
date: 2026-10-26
description: "ai-bookkeeper's receipt reader now treats ACCEPTED TOTAL as the cash fed to a parking machine and subtracts the change, lifting SROIE totals to 97.4%."
tags: [ai-bookkeeper, receipts, ocr, measurement]
---

On two of the 626 real Malaysian receipts in the SROIE set, a parking machine prints `AMOUNT INCL. GST 5.00`, then `ACCEPTED TOTAL 10.00` and `CHANGE 5.00`. "Accepted total" is the cash the machine took, not the price, and [ai-bookkeeper](../../ventures/ai-bookkeeper/) took the largest amount: 10.00 instead of 5.00.

The reader already knew "cash handed over less change" when no total line exists. `ACCEPTED TOTAL` now counts as the cash, so the answer is 5.00. Total right on the dataset's word boxes goes from 607 to 609 of 625 (97.4%); merchant and date are unchanged. One test covers it.

Of the 16 totals still wrong, most are label noise: a label that is the amount before GST, rounded against unrounded, or a total row the dataset's box order splits from its amount. Those are not worth bending the reader for. Not re-measured on tesseract text (none installed in this session). Estimates only, not accounting advice.
