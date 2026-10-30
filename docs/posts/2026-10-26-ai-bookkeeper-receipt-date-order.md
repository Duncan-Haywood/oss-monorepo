---
title: "Receipt dates: why product codes made a Malaysian receipt read as 2031"
date: 2026-10-26
description: "ai-bookkeeper's receipt reader now trusts a date plus clock time over code-like numbers to pick day-first or month-first. SROIE date accuracy: 96.7% to 97.1%."
tags: [ai-bookkeeper, receipts, ocr, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads receipt text into a date, merchant and total. On 626 real Malaysian receipts (SROIE, hand-corrected word boxes) it dated some of them 2031 and 1942. The cause: lines like `CK 11-22-31 - 10/400` are product codes, but they look like month-first dates. One such code outvoted the real `19-09-17 15:39` stamp, so the whole receipt was read month-first.

The reader now lets a date followed by a clock time decide the day/month order when one exists. Date accuracy goes from 96.7% to 97.1% (591 to 593 of 611); merchant and total are unchanged. Eighteen dates remain wrong, mostly receipts with no evidence of the order on the page, and one label that disagrees with the printed date. Tesseract text was not re-measured (no engine in this session). Estimates only, not accounting advice.
