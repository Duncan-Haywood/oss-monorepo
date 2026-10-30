---
title: "A loyalty-voucher line no longer passes for the receipt total"
date: 2026-10-26
description: "ai-bookkeeper's receipt reader took 'TOTAL SV' voucher counts for the total on some Malaysian receipts; fixing it lifted SROIE accuracy from 96.6% to 97.0%."
tags: [ai-bookkeeper, receipts, ocr, measurement]
---

Scoring [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s receipt reader on 626 real Malaysian receipts (SROIE) showed two receipts where the total came out as `10.55`. The receipts print `TOTAL SV` and `TOTAL GV` voucher rows, and the reader treated them as totals. They are now skipped, and the GST summary row (amount plus 6% tax) gives the amount paid.

Total accuracy on the dataset's word boxes: 96.6% to 97.0% (604 to 606 of 625); merchant and date unchanged. This was not re-measured on tesseract text, which this session didn't have. Estimates only, not accounting advice.
