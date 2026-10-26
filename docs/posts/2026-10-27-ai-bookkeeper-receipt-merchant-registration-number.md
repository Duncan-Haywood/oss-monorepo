---
title: "One bracket cost a receipt reader 20 points on shop names"
date: 2026-10-27
description: "ai-bookkeeper misread the merchant on 22 AEON receipts: a registration number looked like symbols. Fixing it lifted merchant accuracy from 63.6% to 83.2%."
tags: [ai-bookkeeper, receipts, accounting]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipts into a merchant, date and total. Scored on the 626 hand-labelled SROIE receipts (word boxes, not OCR), merchant was right on 63.6%. Listing the misses showed 22 of the 57 wrong ones were the same chain: the first line, `AEON CO. (M) BHD (126926-H)`, was rejected as "not wordy" because the bracketed registration number counted as symbols, so the address line below it became the merchant.

The reader now strips a trailing bracketed registration number before judging the line. Merchant exact: 521 of 626 (83.2%). Date and total are unchanged. Not re-measured on tesseract output (no engine in this run); the remaining misses are mostly brand against registered company name. Receipt matching to bank lines uses the merchant, so this directly helps pairing. Estimates only, not accounting advice.
