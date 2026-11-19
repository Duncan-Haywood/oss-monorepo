---
title: "When OCR reads АО as AD: catching misread legal forms on Russian receipts"
seo_title: "Russian receipt OCR: reading misread seller legal forms"
date: 2026-11-19
description: "The parser now takes the seller even when OCR misreads its legal form. Held-out Russian slips go from 104 to 106 of 146, with none lost."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and matches each one to a bank line by merchant, date and total. Yesterday's run swapped a
Cyrillic recogniser into the OCR and found Russian sellers by their legal form: the line that opens
with ИП (a sole trader), ООО, АО or ЗАО is the seller. On held-out slips that took the merchant
from 0 to 104 of 146 right
([post](2026-11-18-ai-bookkeeper-a-cyrillic-model-reads-the-shop-name.md)).

The run's own notes listed what was left. On some slips the name was in the reading, but the
engine had misread the form in front of it, so no line "opened with a legal form" and the seller
was lost.

## What the misreadings look like

We printed the misses on the development split (149 photos) on our own machine, because the labels
name sole traders by their full names. The form misreadings were small and regular:

- `AD "…"` and `до "…"` for АО: Д and А look alike in a receipt font
- `ИЛ ПЕТРОВА Ю.С.` for ИП (П read as Л)
- `ЗДО` for ЗАО
- `ОБЦЕСТВО` for ОБЩЕСТВО, or a spelled-out "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТ" whose last two
  letters and the shop's name wrapped onto the next line

The catch is that some of these are also ordinary words. "До" means "until" and turns up in lines
like `до 31.12`. So each misreading counts only where what follows rules out the ordinary word: АО
before a quoted name, ИП before a surname with initials or a full three-part name, and ЗДО, which
is not a word at all.

## Results

| split | main | this change |
|---|---|---|
| development (val), seller right | 113 of 146 | 117 |
| held out (test), scored once after the rule was committed | 104 of 146 (71.2%) | **106 (72.6%)** |

No slip the old rule got right was lost on either split. Totals didn't move (137 of 148 held out),
and receipts from other datasets never reach this code.

We also tried printing every spelled-out form in its short version (`ООО "…"`), which keeps the
merchant field short. On the development split it gained two slips and lost three whose labels
spell the form out, so we dropped it. The parser prints the form the way the slip prints it.

## What's left

Two held-out slips is a small gain, and an honest one. About half of the remaining misses happen
in the OCR, not the parser: the seller's name isn't in the reading at all. The next things to try
are a second, larger-scale read of the slip's header, and moving the Cyrillic model into the
in-browser OCR, which still reads Russian totals but not names.
Method and numbers: [`eval/receipt-ocr-ru-forms-2026-11-19.md`](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-forms-2026-11-19.md).
