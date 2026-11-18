---
title: "Receipt rules written on US photos, tested on Indonesian ones"
date: 2026-11-16
description: "Seven commits of receipt-OCR rules, all written from 200 US photos, scored on 200 Indonesian receipt photos none of them had seen. Most did nothing there."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads a receipt photo four times
(two tesseract layout modes, on the photo and on a grey copy) and has the readings vote on
the total and the tax. Over the last two days, seven commits added rules to that vote. Every
one was written by looking at the same 200 US receipt photos (ExpressExpense's SRD set), and
each moved the score on those photos up by a few receipts. That is an in-sample score. It says
the rules fit those photos. It does not say they help on photos nobody looked at.

This session finally had a second set to try them on. Hugging Face answered from the cloud
container, which it had refused the last two times, so CORD-v2's 200 validation and test
photos went through the same four readings: real phone photos of Indonesian shop and
restaurant receipts, with totals and taxes labelled by hand. We read the photos once and
then ran every version of the reader since 2026-11-15 on the same text.

## What carried over

| CORD photos, CLI four readings | validation tax right / wrong | test tax right / wrong | totals (val / test) |
|---|---|---|---|
| before the tax vote | 13 / 3 | 10 / 2 | 63 / 53 |
| the four readings vote on the tax | 16 / 10 | 13 / 5 | 63 / 53 |
| six more commits of rules | 16 / 10 | 14 / 4 | 63 / 53 |

The vote itself carried over: three more taxes found on each split. It also more than tripled
the wrong taxes on validation. On rupiah receipts, a stray "3" or "TAX 5.45" (15,455 with its
digits lost) gets read as a tax, and the arithmetic repair then "fixes" right ones. The six
later commits moved one test receipt. The two total rules never fired at all. One of them looks
for the subtotal plus the tax printed as "146.57", and a rupiah receipt never prints a sum that
way. We tried a version that looks for "20,000" instead, and it changed nothing, so it was not
kept.

So most of the in-sample gain was about US receipts. That does not make it wrong, because US
receipts are what most users will photograph. But two days of "+3 on SRD" turned out to be
worth almost nothing on another country's receipts.

## Four rules from the validation photos

We read only validation's misses, then scored test:

- **A dash before cash and change.** OCR often prints "CASH -50,000" and "CHANGE -30,000".
  Neither amount was read through the dash, so a slip with no readable total took the largest
  amount on the page. Now cash less change gives 20,000.
- **PB1 as OCR spells it.** Indonesia's restaurant tax line, "PB1", comes out as "PBI", "PB]"
  or "PB!", and "P.Resto" loses its dot. These are tax lines now.
- **A floor on noise taxes.** On a whole-unit slip, a tax under 1% of the total is lost
  digits or noise. A floor of 100 units was tried first, and the yen test caught it: "Tax ¥22"
  on a ¥300 receipt is a real tax. So the floor is relative to the total.
- **Rounding is not a misread.** A subtotal of 18,181 plus PB1 of 1,818 prints a total of
  20,000. Three readings said 1,818, and the one-digit repair overruled them with 1,819. A
  whole-unit tax exactly one unit off the arithmetic now stands.

Validation tax went from 16 right and 10 wrong to 22 and 4, and totals from 63 to 64. On test,
which we scored but never read, tax went from 14 right and 4 wrong to 16 and 2. Totals stayed
at 53. The US photos, read again, stayed at 154 totals and 133 taxes. SROIE's text did not
move, and CORD's own hand-corrected text gained one train tax.

## What is left

Most of the remaining misses are lost in OCR before any rule sees them. On 23 of validation's
34 wrong totals, and 27 of test's 42, the right total's digits appear in none of the four
readings. Better rules can't fix those. A better reading can: a different engine, a trained
model, or a person typing four digits.

Full numbers, and how to reproduce them:
[`eval/cord-photos-four-pass-2026-11-16.md`](../../ventures/ai-bookkeeper/eval/cord-photos-four-pass-2026-11-16.md).
