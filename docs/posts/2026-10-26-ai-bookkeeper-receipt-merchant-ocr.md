---
title: "Reading shop names off OCR'd receipts: 33% to 37%"
date: 2026-10-26
description: "ai-bookkeeper's receipt reader now skips OCR noise, GST and state lines when picking the merchant, measured on 626 real receipt scans."
tags: [ai-bookkeeper, ocr, receipts]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipts into merchant, date and total. On 626 real Malaysian receipt scans (SROIE) run through tesseract, the merchant came out exactly right 33.1% of the time. Three small changes lift that to 36.6%: skip lines that are mostly symbols, GST registration numbers and state names; strip stray marks before the name; and read the engine's `SON BHD` as `SDN BHD`.

The first attempt, filtering any line with few letters, looked better on OCR text but cost 7.6 points on clean text, because names like `MR D.I.Y.` and `99 SPEED MART` have dots and digits. Counting symbol characters instead kept clean-text accuracy flat (63.7% to 63.6%). Most remaining misses have no readable shop-name line at all. Phone photos are still untested. Estimates only; check amounts before filing.
