---
title: "\"TOTAL 184 47\": reading a receipt total whose decimal point the OCR dropped"
seo_title: "Receipt OCR: reading totals with a lost decimal point"
date: 2026-11-15
description: "OCR often drops the point in a receipt total. Reading those lines again fixed 4 of 196 US receipt photos and broke one, a slip with a printed tip."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

The ai-bookkeeper reads receipt photos with tesseract, in your browser or on the command line, and pairs each receipt with the bank line that paid it. On ExpressExpense's 196 US receipt photos it read the total right on 153. This post is about four of the misses, and about why the fix for them also costs something.

## The point goes missing

Thermal printers make the decimal point a small dot, and a phone photo of a curled slip often loses it. Here are four total lines from four different photos, as tesseract.js read them:

- `TOTAL 184 47)` (the same in three of that photo's four readings)
- `esl TOTAL : 92:22`
- `dount Due 9, 70`
- `mount Due $2 17`

A person reads those as $184.47, $92.22, $9.70 and $2.17 straight away. The bookkeeper didn't. Its money pattern wants `184.47`. A comma on a receipt written in dollars isn't a decimal point to it, and a colon or a space doesn't count either. So it found no amount on the total line. With no total line, it fell back on a guess: the card line, the cash less the change, or the largest amount on the slip. All four guesses were wrong.

## Reading the line again, narrowly

The fix is small, and it's fenced in. It only runs when:

- the receipt is written with a decimal point (not `12,50`, not whole rupiah),
- the line has a total word ("total", "amount due", "balance due"),
- no amount already reads on that line, and
- what comes after the total word ends in dollars, then one space, comma or colon, then exactly two digits.

A time (`10:45 PM`), three digits after the gap, and anything with a euro sign stay as they are. A euro receipt's comma really is its decimal point. When the rule fires, the receipt carries a note: `total line read "184 47" with its decimal point lost: took 184.47, check the total`.

## What it fixed, and what it broke

The page reads each photo four times and the readings vote. With the rule in place it gets 156 of the 196 totals right, up from 153. It fixed those four photos and broke one.

The broken one is worth a look. That slip prints `Total 43.60`, then a voluntary 18% tip, then `Total 50.80`. One reading now picks up the first total (`Total: 43 60`). The subtotal plus tax agree with 43.60, so the vote takes it. Our label is the last amount printed, 50.80. That's what the card was charged, but 43.60 isn't nonsense either: it's the bill before the printed tip. The receipt notes say to check the total, and the bank line will show 50.80.

Across all 784 readings of these photos, the rule fired 14 times and gave the right amount 7 times. Most of the wrong firings were on photos where the digits were misread too (`Total 7 46` for 7.56). There the other readings outvoted it, and the page still read the right total. The number of wrong totals the page shows with no warning stayed at 3 of 196.

I wrote the rule while looking at these 196 photos, so 153 to 156 isn't a held-out score. The held-out check is SROIE, 625 scanned Malaysian receipts read by the same engine that I never looked at while writing it. There it changed nothing on balance: 506 totals right before and after, with one scan fixed and one broken. So the rule earns its keep on US phone photos, where the dot is small, and does no net harm on scans. On the datasets' own hand-corrected text, which has no lost points, nothing changed.

## What's left

The page now reads 79.6% of these US phone photos right. Another 13 photos have the right amount somewhere in their text and still lose, among them a `Total before tip` line, a total word OCR mangled into `T0TALE`, a cash line and a subtotal. On the rest, no reading has the amount anywhere, so the reader can't help. That's the OCR's limit, not the reader's.

The full per-photo table and the commands are in [`ventures/ai-bookkeeper/eval/split-decimal-2026-11-15.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ai-bookkeeper/eval/split-decimal-2026-11-15.md). The bookkeeper is free and open source (MIT), and it runs on your own machine.
