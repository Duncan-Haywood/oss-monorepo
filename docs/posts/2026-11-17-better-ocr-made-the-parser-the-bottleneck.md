---
title: "A better OCR engine made the parser the bottleneck: 45 receipt misses read one by one"
seo_title: "Receipt OCR parsing: what RapidOCR's misses on 600 receipts were"
date: 2026-11-17
description: "With RapidOCR, most missed receipt totals were in the text. Nine parser rules: CORD train 515 to 539 of 583, held-out test 80 to 83 of 95, no total lost."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine. Earlier today it gained a second OCR engine, RapidOCR, which reads far more of the
text than tesseract does. That changed where the errors are. With tesseract, two thirds of
missed totals were lost in the OCR: the right digits were nowhere in the text. With RapidOCR,
45 of the 68 misses on 600 CORD train photos had the right total somewhere in the reading.
The parser was dropping them.

So this run read those 45 one at a time. Most turned out to be small, ordinary failures:

- **A colon.** `Change:5,000` did not read as an amount, because the reader will not take a
  number glued to a word. Worse, `Pay Cash 50.000  Change:5,000` sits on one line, and the
  cash line's last amount is the change. Five receipts.
- **A lost letter.** One restaurant prints `DUE` with the amount right after it. RapidOCR
  dropped the E and the space (`DU1,241,790`), and our OCR cleanup then turned the D into a
  zero. Five receipts, all the same restaurant.
- **Words that look like a total and aren't.** `TOTAL OTY 5PCS` (Total Qty), `Discount total`,
  `Total Discont`, `Ch ange Due`. Four receipts.
- **Words that are a total and don't look like one.** `Tatai...`, `Tatal`,
  `Tota.......`. These now count, but only when no real total line was read.
- **The total with its word lost.** On several slips the word "Total" never came through, and
  the line that did say `TOTAL` held the cash or a stray number. The receipt still shows the
  real amount twice: once on a line of its own, and once more as subtotal plus tax, or as cash
  less change. When two of those agree, and no check backs the read total, we now take the
  amount they agree on.

| photos | before | after |
|---|---|---|
| CORD train shards 1-3, RapidOCR (where the rules came from) | 515 / 583 | **539** |
| CORD validation, RapidOCR | 83 / 98 | 85 |
| US receipts (SRD), RapidOCR | 180 / 196 | 182 |
| **CORD test, held out, scored once**: RapidOCR | 80 / 95 | **83** |
| same, RapidOCR plus tesseract's four readings | 80 | 83 |
| same, the page | 81 | 84 |

In every set, **no total went from right to wrong.** Two taxes did. Each came after its total
became right: the tax reader then met text that is still damaged. Both are written up in the
[eval note](../../ventures/ai-bookkeeper/eval/rapidocr-parser-misses-2026-11-17.md).

**What it means.** Once the OCR engine reads the text, a receipt parser has to cope with the
habits of real printers and real OCR: glued punctuation, one printer's abbreviation, misspelt
labels. Nine small rules covered 24 receipts. Of the 44 misses left, half are lost in the OCR
and half are one-offs, such as an amount split over two lines or two kinds of separator in
one number. The next useful measurement is not another rule. It is the full five-reading vote
on these same 600 photos, which needs about 100 minutes of tesseract.

Data: CORD-v2 by Clova AI (CC BY 4.0) and the ExpressExpense sample receipts. No photos are
copied into the repository. Results are estimates from these datasets, not a guarantee for
your receipts. Check totals before you file them.
