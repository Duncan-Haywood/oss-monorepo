---
title: "Receipt totals survive a garbled tax cell"
date: 2026-10-26
description: "ai-bookkeeper now recovers a receipt total when the OCR garbles the tax cell on the closing Total row, measured on 626 real receipt scans."
tags: [ai-bookkeeper, ocr, receipts, measurement]
---

On 626 real Malaysian receipt scans read by tesseract, [ai-bookkeeper](../../ventures/ai-bookkeeper/) got the total right on 74.9%. One repeatable fault: a GST summary ends with `Total : 89.50 5.37`, the OCR prints the tax cell as `§.37]` or `2.7`, and the before-tax base was taken as the total.

When that closing row has two numbers, the reader now checks the `Total Sales (Inclusive of GST)` line above it against the base plus 6% or 8%, or a `Total GST` line against the tax rate. Result: **74.9% to 75.8%** (6 more receipts), and the dataset's hand-made boxes stay at 97.1%. A first version without the two-number condition broke a receipt with a single `TOTAL 4.90` row, which a test now guards.

The remaining misses are mostly single digit errors in the amounts, so the next gain needs better OCR input, ideally real phone photos. Estimates only, not accounting advice.
