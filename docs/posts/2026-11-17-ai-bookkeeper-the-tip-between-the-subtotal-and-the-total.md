---
title: "The tip between the subtotal and the total: one more check for receipt photos"
seo_title: "Reading receipt tax with a service charge or tip, via OCR"
date: 2026-11-17
description: "Subtotal plus tax should equal the total, until a receipt prints a tip or service charge. A small fix to an open-source receipt reader, and how little it moved."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos four times with
tesseract (two page modes, on the photo and on a grey copy) and then lets the receipt's own
arithmetic settle what the total and the tax are. One check carries most of the weight:
**the subtotal plus the tax is the total.** When the readings disagree on the tax, the one that
makes that sum work gets two extra votes.

That check is wrong on a whole class of receipts: those that print a service charge or a tip
before the total. One receipt in our labelled set of US photos prints:

```
Sub-total:            40.00
Sales Tax 7%:          2.80
Resort Tax 2%:         0.80
Total                 43.60
Voluntary 18% Tip:     7.20
Total                 50.80
```

The first OCR reading lost the resort tax line and read a tax of 2.80. The second read both
lines and added them to 3.60. Neither 40.00 + 2.80 nor 40.00 + 3.60 is 50.80, so neither got
the arithmetic bonus, the vote tied, and the first reading's 2.80 won.

## The change

The vote now collects every amount on a service, gratuity or tip line from any reading
(skipping "suggested tip" tables), and accepts subtotal + service + tax = total as the
arithmetic too. 40.00 + 7.20 + 3.60 = 50.80, so 3.60 wins.

The same idea fills a gap: when no reading could read the tax's amount but the subtotal,
service charge and total are all there, the tax is what is left over, as long as some reading
prints a tax line at all. That last condition matters. Two Indonesian receipts in the CORD
training set print "Service" and then "Others" with no word for tax, and nobody labelled a tax
on them; without the condition the reader would have invented one.

## How much it moved

Less than we hoped, which is worth saying plainly.

| | before | after |
|---|---|---|
| 200 US receipt photos, tax right / wrong (CLI) | 133 / 12 | 134 / 11 |
| the half held out while choosing the rule | 68 / 3 | 68 / 3 |
| CORD training text, tax right | 324 | 326 |

One photo out of 200, and nothing on the held-out half. On these photos the receipts that print a service charge mostly
miss their tax for other reasons: one has its total misread as "7.07", and the cash-less-change
line that would rescue it reads "HANGE" instead of "CHANGE". Another prints two tax lines OCR
turned to noise. The arithmetic can only settle what at least one reading saw.

The case that started this, an Indonesian restaurant receipt with a 7.5% service charge, is in
a held-out set of photos we could not download this session, so it waits for a run that can.
The full numbers and the reproduction steps are in
[`eval/service-charge-vote-2026-11-17.md`](../../ventures/ai-bookkeeper/eval/service-charge-vote-2026-11-17.md).

Results are estimates from OCR and the receipt's own arithmetic, not tax or accounting advice:
check the tax on any receipt the reader flags.
