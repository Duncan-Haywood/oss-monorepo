---
title: "When the receipt's amounts sit one row below their words"
date: 2026-11-17
description: "RapidOCR boxes a receipt's words and amounts apart, and rows slip by one. A subtotal-plus-tax check puts them back: US photo totals 182 to 187 of 196."
tags: [ai-bookkeeper, receipts, ocr]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos with RapidOCR
(PaddleOCR's models, run locally) and then parses the text for the total and the tax. On 196
US receipt photos it had 182 totals right. Here is one of the 14 it got wrong, as RapidOCR
printed it:

```
Subtotal  $5.50
Tax  $86.65
Total:  $6.93
...pedun...  S93.58
```

The receipt says subtotal 86.65, tax 6.93, total 93.58. Every amount is there and every word
is there. They just sit one row apart. RapidOCR finds text boxes, and on a receipt the word
column and the amount column are separate boxes. When the photo is a little tilted, the
amount's box sits closer to the next row's word, and the rows slip by one. Tesseract reads a
line as a line, so it never makes this mistake.

## The fix: let the arithmetic pick the row

A receipt checks itself: subtotal plus tax is the total. The parser already uses that to catch
misread digits. Now it also uses it to catch shifted rows. If no check confirms the total it
read, it tries the amount one row below the total line, and one row above. It takes that
amount only if the subtotal and the tax, read at the same offset, add up to it to the cent,
and only one such amount exists. The receipt then gets a note asking the user to check the
total.

On the receipt above, read one row down: 86.65 + 6.93 = 93.58. Taken.

Two guards came out of testing. A slip with `Sbt1 w/Tax: $73.34` above `Amt Due: $55.39`
(a void after tax) already makes 73.34 from its subtotal and tax read in place. That is an
ordinary subtotal line, not a shifted total. And the rule only looks next to the total line the
parser actually read, so an earlier `Total` above a printed gratuity doesn't override the
`Balance Due` below it.

Two smaller fixes came from the same misses. `TOTALDUE $154.78` with the words glued is now a
total line (before, the largest amount won, and that was a suggested 22% tip). And
`Tl:01.48.28.44.81`, a Paris phone number after "Tél", is no longer read as a total line
holding 28.44.

## How much it helps, and where it doesn't

The rules were written from the even-numbered half of the photos and checked on the
odd-numbered half.

| | before | after |
|---|---|---|
| choose half (99 totals), RapidOCR | 90 | **95** |
| same, what the page shows | 92 | **95** |
| held-out half (97), RapidOCR | 92 | 92 |
| all 196 | 182 | **187** |

The held-out half didn't move. None of its misses have these shapes. One honest caveat: its
first scoring was 91, because the rule fired on that earlier-`Total`-above-a-gratuity receipt.
The guard that fixed it was written after seeing that miss, so the held-out half is no longer
a clean test of this rule. The full method and every number are in
[the eval note](../../ventures/ai-bookkeeper/eval/rapidocr-srd-misses-2026-11-17.md).
Indonesian receipts (CORD), Malaysian scans (SROIE) and tesseract's readings didn't change.

What's left on the choose half is harder: two columns interleaved on one line, a discount and
gratuity between the subtotal and a `TOTAL:` with no amount, an IKEA slip read across its
columns, and a handwritten total under a printed tip line.
