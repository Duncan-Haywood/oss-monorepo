---
title: "Reading a receipt's tax that OCR could not see, from the total"
date: 2026-11-16
tags: [ai-bookkeeper, receipts, ocr, evaluation]
description: "On Indonesian receipt photos the tax line is often a blur. With the total and a few subtotal digits, 10% PB1 arithmetic gives it back, on two of 21 misses."
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos four times with
tesseract and lets the readings vote. On the 100 validation photos of CORD-v2, a public set of
Indonesian shop and restaurant receipts, 47 photos have a labelled tax. Before this run we
read 23 of them right, 3 wrong, and found no tax at all on 21.

We printed every reading's tax, subtotal and total lines for those 21 to see what was left.
Eleven were lost: no reading had a tax line with digits, or the whole bottom of the receipt
was noise. Five had the wrong total, and most of the tax checks lean on the total. Two were
different. The total was right, but no reading could read the tax line's amount.

On one of them, the total read `172,000` in two readings. The tax line came out as
`TAX 15.45`, `TAX 15.440` and `TAX 15.435`; the real tax is 15,636. Three readings printed
the subtotal as `56,364`. The real subtotal is 156,364: OCR dropped the first digit every time.

Indonesian restaurant tax (PB1) is 10% of the subtotal. So 172,000 split at 10% is 156,364
plus 15,636, and 156,364 ends in the `56,364` the receipt shows. The reader now does exactly
that, with guards. It splits only a whole-unit total the readings agree on, when no read
subtotal already gives the tax. Some reading must print a tax line. A subtotal line must show
the split's subtotal, in full or its last five digits, and only one of 10% or 11% may fit.
The receipt then says it split the total, so the person can check it.

On validation, tax went from 23 to 25 right, with 3 still wrong. The first version also
split a wrongly read total of 3 into a tax of 0, which is why it now needs a subtotal of four
or more digits. On the held-out test photos, scored once at the end, the rule took no tax,
right or wrong: test stays at 16 of 41.

We also tried reading `PRi:` and `PRL:` at the start of a line as PB1, tesseract's misreading
of it. That fixed one validation photo. On test it read `PRI : 25,080` where the tax is
25,585, and a tie in the vote went the wrong way. Over 200 photos it gained nothing, so it is
out. We decided that after seeing the test score, and the note says so. What would have saved
that test photo is a vote that counts the service charge: 238,000 plus 17,850 service plus
25,585 tax is the printed total. Finding that on test means it has to be tried and measured
on validation first.

Most of what is left is OCR: the digits are not in any reading. The numbers, the 21 photos
sorted by cause, and how to reproduce them are in
[the evaluation note](../../ventures/ai-bookkeeper/eval/cord-tax-split-2026-11-16.md).
The reader's figures are a bookkeeping aid, not tax advice; check every receipt it flags.
