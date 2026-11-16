---
title: "When OCR misspells TOTAL: letting the receipt's own sum vote"
date: 2026-11-16
description: "A receipt photo read four times can lose the word TOTAL in every reading. Its subtotal plus tax, printed on the page, now gets a vote."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a phone photo of a receipt
four times (two tesseract layout modes, on the photo and on a grey copy) and lets the
readings vote on the total. The tax is read next, and most of the tax checks lean on that
total: the subtotal plus the tax should make it. So when the total is wrong, the tax usually
goes with it. On the 200 public ExpressExpense receipt photos (SRD), 27 of the 41 receipts
with no tax had a wrong total too.

## What the readings held

We printed every reading's subtotal, tax and total lines for those photos. Most are lost
causes: thirteen have no total or tax line in any reading, and in three more the total
is never printed legibly anywhere ("Visa $29.5", "Order Tota! A Raa"). Two patterns were
not lost causes.

**The word TOTAL was damaged in every reading.** Photo 1133 reads "SUBTOTAL: 134.46" and
"Tax(9%) 12.11" cleanly in two readings. The total line comes out as "=—STOTAL: = -:146.57"
and "SOSTOTAL: ~=—'146.57". Neither matches the word "total", so no reading takes 146.57 as
the total, and a fourth reading's "A TOTAL: 12.11", the tax read as a total, won the vote.

The fix puts the receipt's own arithmetic to the vote: a reading's subtotal plus its tax
becomes a candidate, but only when that exact amount is printed somewhere on the page. Each
reading that prints it gives one point. A reading that read a total off a real total line
still wins a tie, and the receipt says "the subtotal 134.46 plus the tax 12.11, printed on
the page: check the total". The same rule fixed photo 1002, whose 7.61 was printed only on
the card line ("Visa 7.61") while its total line read "Total 1.61".

**A leading zero.** Photo 1030 has "TOTAL: 04.78" in one reading and "TOTAL: $94.78" in
another. They tied, and the earlier reading won. A printed total never starts with 0
dollars, so a total line read that way now counts as a guess (half a vote).

## Results

| SRD, CLI `--four-pass` | before | after |
|---|---|---|
| totals right (196) | 151 | **154** |
| tax right (185) | 132 | **133** |
| item splits kept (200) | 49 | 49 |

Three gains, none lost. This is in-sample: the rules were written from these photos. The
held-out sets we have (CORD and SROIE) are dataset text, one reading per receipt, where the
vote never runs, so they are unchanged and say nothing about it. A held-out set of photos
read four times is the next thing to build.

One rule was tried and dropped. A reading whose cash handed over less change disagrees
with its own total line would lose its total-line point. That was meant for photo 1022
("TOTAL: 7.07", "CASH 100,00", "CHANGE 62.63", total 37.37). It changed no photo, because
"100,00" with a comma never reads as an amount on a receipt written 12.50. We did not
widen the comma rule for one photo.

The write-up with every photo's case is in
[`eval/receipt-total-first-2026-11-16.md`](../../ventures/ai-bookkeeper/eval/receipt-total-first-2026-11-16.md).
