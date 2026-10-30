---
title: "Reading the company name off a receipt from its registration number"
date: 2026-10-27
description: "ai-bookkeeper's receipt reader now trusts the line above a printed registration number, lifting merchant accuracy on 626 real receipts from 83.2% to 84.7%."
tags: [ai-bookkeeper, receipts, ocr]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads a merchant, date and total from receipt text. On the 626 SROIE receipts (real Malaysian shop slips, labelled by hand) the merchant was right on 521. Many of the misses started the same way: something printed above the shop, such as a "redeem voucher before points expiry" promo, a printer error or a stamp, was picked as the name.

Malaysian slips print the company registration number, like `(317041-W)`, directly under the registered name. The reader now looks for that line and takes the name just above it. Result on the same receipts: 530 right (84.7%), 30 wrong (down from 40), date and total unchanged, and a before/after diff shows no receipt that was right became wrong. Remaining misses are mostly a brand printed instead of the legal name, which is fine for matching a bank line.

Measured on dataset word boxes, not phone photos; tesseract text is the harder case and is still tracked in the README. Estimates only, not accounting advice.
