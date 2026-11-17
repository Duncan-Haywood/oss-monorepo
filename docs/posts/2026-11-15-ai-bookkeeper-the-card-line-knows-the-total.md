---
title: "When a receipt photo loses its TOTAL line, the VISA line still knows what you paid"
seo_title: "Receipt OCR: read the card line when the TOTAL line is lost"
date: 2026-11-15
description: "Two reading rules for receipt photos, the card line and a letter glued to the total, took 150 to 153 of 196 US photos right. A third was dropped."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

The ai-bookkeeper reads receipt photos in your browser with tesseract.js, so nothing leaves your machine. Each photo is read four times and the readings vote on the total. After the [last change](2026-11-15-ai-bookkeeper-a-guess-should-not-outvote-a-total-line.md), it got 150 of 196 labelled US receipt photos right. In 17 of the misses, the right total was printed somewhere in the text and the reader still lost it.

So this time I read those 17 by hand, looking for the labelled amount in each reading. Three patterns came up. Two of them became rules, and the third made things worse.

## The card line

On several slips no reading had a line that said TOTAL. The thermal print was faded or folded, or the word came out as noise. But the payment line was there: `VISA 6.56`, `Credit Care 13.22`, `MASTERCARD ##4617 $52.47`. With no total line, the reader fell back on the largest amount on the page, which turned out to be a phone number read as money (19.07), or 556.00 from a garbled item line.

The amount on a card line is what the card was charged, and that is the number a bookkeeper wants to match against the bank line anyway. So when there is no total line, the reader now looks for the last line that names a card and has an amount on it, before it falls back on the largest amount. It skips tip, change, cash-back, balance, points and savings lines. A printed total line still wins over the card line.

## A letter glued to the total

One reading of a photo printed `Total 47.90` and then `Balance Due A7 .90`. The reader takes the last total line, and the money pattern found `7.90` in it and dropped the A. The A was a 4.

The cleanup pass already turns S, B, O, l, I and Z into digits inside number-shaped tokens. An A glued to an amount could just as well be a real A, though, so the reader doesn't swap it blindly. It treats the swap as a candidate (A for 4, G or b for 6, T for 7, g or q for 9) and only takes it when the receipt backs it up: subtotal plus tax, the items added up, cash less change, or another total line giving exactly 47.90, while nothing gives 7.90. On this photo the tax was misread in every reading (2.18 for 2.75), so the arithmetic couldn't confirm it, but the `Total 47.90` line above could. The note on the receipt says what happened and asks you to check.

## A clipped TOTAL, tried and dropped

One photo read `Tota 17.80`. Counting "Tota", "TOTAI", "T0tal" and "Iotal" as total words fixed it. Then I ran the change on 625 Malaysian receipt scans I hadn't looked at while writing the rules, and it broke three of them. On those scans the clipped spelling is usually the worse reading of a line printed twice: `Tota Ami Rounded 108.00` against a clean 104.00 above it, or `GST @6% included in tota] RM 0.28`. One fixed photo against three broken scans isn't a trade worth making, so the rule is out.

## What it did

| totals right | before | now |
|---|---|---|
| page, 196 US receipt photos (ExpressExpense SRD) | 150 (76.5%) | **153 (78.1%)** |
| 625 SROIE receipt scans through tesseract.js, two readings (held out) | 505 | **506** |
| SROIE receipts, the dataset's own text | 611 of 625 | 611 |
| CORD receipts, the dataset's own text (train / validation / test) | 749 / 96 / 92 | 749 / 96 / 92 |

Four photos were fixed and one was broken. On that one, two readings print the card line as `Credit $21.13` for 21.73, and the old guesses had landed on the right number by chance. Wrong totals that the page doesn't warn about stay at 3 of 196.

These are reading rules, not weights fitted to the data, so there was no tuning half to hold out. The gain shows on both halves anyway: +1 on the even-numbered photos and +2 on the odd ones. On the held-out scans, one more total came out right (a card line) and none broke. The card rule fired on 13 of the 784 readings and was right on 10.

Some misses are still open: `mount Due $2 17`, where the amount is split by a space, `Total before tip: $58.30`, and photos where no reading has the amount on any line at all. The numbers, the per-photo readings and the commands to reproduce them are in the venture's [eval note](../../ventures/ai-bookkeeper/eval/total-line-gaps-2026-11-15.md).
