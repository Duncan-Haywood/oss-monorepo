---
title: "Two new receipt datasets were old ones, so the bookkeeper learned to read Russian slips"
seo_title: "Testing a receipt reader on Russian slips it had never seen"
date: 2026-11-18
tags: [ai-bookkeeper, receipts, ocr, evaluation, datasets]
description: "Two Hugging Face receipt sets were CORD and SRD again. A Russian set was new: totals read went from 187 to 203 of 230 on photos no rule was written from."
---

The [AI bookkeeper](../../ventures/ai-bookkeeper/README.md) reads totals and tax off receipt
photos, on your own machine. It has been measured on four public receipt sets: CORD
(Indonesian), SROIE (Malaysian), ExpressExpense SRD (US) and WildReceipt (US, Europe, Asia).
After a week of rules written from their misses, most of what it still gets wrong comes from
the OCR engine, not the parser. The way to find out how good it really is: a set nobody here
has looked at.

## The first two "new" sets were not new

A search of Hugging Face turned up two promising ones with permissive licences:

- a "supermarket receipts" set of 192 photos labelled in Label Studio. 167 of the 192 have the
  same total and subtotal as a CORD receipt, and the photos have CORD's blurred shop names. It
  is CORD with new labels.
- a set of 230 US receipt photos whose labels were written by Gemini. 199 of the 230 totals
  match a receipt in SRD or WildReceipt (the same WinCo, the same Pizza Hut). It is mostly SRD,
  with a model's labels instead of a person's.

Neither would have been a fair test, because the reader has been tuned on those photos.
Matching totals is a cheap way to find this out. It took a few seconds against the labels
already in the repository.

## A set that was new: Russian fiscal receipts

[cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru) (MIT) holds
about 1,000 phone photos of Russian shop receipts, from Lenta, Perekrestok, Spar, small traders
and the St Petersburg metro, each with its total labelled.

The reader's stronger engine, RapidOCR, has no Cyrillic in its default model. It prints
`ИТОГ` (total) as `HTOr`, `MTOr`, `UTOr` or `WTOr`, and `ИТОГО К ОПЛАТЕ` (total to pay) as
`MTOrO K OnMATE`. The parser knew no Russian word for total, so every total it got right came
from its fallback, the largest amount on the slip. That still worked 81-86% of the time: a
Russian slip prints its total three or four times (ИТОГ, the card line, a bare `=413.00`) and
rarely prints a bigger number.

## What changed

- `ИТОГ`, `ИТОГО`, `К ОПЛАТЕ` and the engine's look-alikes are total words now. `ИТОГО без
  скидки`, the total before the discount, is not.
- On the ИТОГ line, a dropped kopeck digit (`27.0`, `2644.`) is a zero. An item's `119.00*1` or a
  tax amount the engine put on the same row is not the total.
- The engine sometimes puts a row's amount on the row next to it. If the ИТОГ amount is printed
  only once, and the slip prints another amount two or more times below it, that amount is
  taken. Failing that, the card line's amount is taken, or cash less change. The ИТОГ stands
  when two payments below it add up to it (a card payment plus an advance). Each of these
  leaves a "check the total" note.

## The numbers, and how clean they are

The rules were written from the validation split (120 to 138 of 145 right). The test split was
scored with the first rules. Its two losses were then read, and they led to the card-line rule,
so its final 136 of 148 (from 126) is not a clean number. A train shard was read next, and three
of its five losses led to fixes too. So the last train shard was downloaded only after the final
change and scored once:

**187 to 203 of 230 totals right (81.3% to 88.3%), 20 gained, 4 lost.**

Two of the four losses are digits misread on the ИТОГ line itself, which the fallback had dodged
by luck. One is the repeat rule replacing a right ИТОГ. One is a row the engine merged. None of
CORD's hand-corrected text moved.

## What it did not fix

The slower engine, tesseract, never finished on these photos. Its default reading ran for more
than nine minutes on each of the first two without printing anything, because the photos have
a textured paper background. Someone running `receipts photo.jpg` on such a photo would see the
command hang, since there is no time limit on the OCR step. That is the next item, together
with a Cyrillic model that reads the words instead of their look-alikes.

The full write-up, with the commands to repeat it, is in
[the eval note](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-2026-11-18.md).
