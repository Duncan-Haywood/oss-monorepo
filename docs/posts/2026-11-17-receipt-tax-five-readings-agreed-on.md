---
title: "Five OCR readings agreed the tax was 1.86, and the checker changed it to 1.56"
seo_title: "Receipt OCR: when the arithmetic fix overrules five agreeing readings"
date: 2026-11-17
description: "With its own RapidOCR port leading, the in-browser receipt reader gets 190 of 196 US receipt totals. One lost tax was a fix that ignored a gratuity."
tags: [ai-bookkeeper, receipts, ocr]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos in the browser:
a JavaScript port of RapidOCR first, then tesseract's four readings, then a vote. Nothing leaves
the device. Earlier today a run added a rule that lets the stronger engine's total stand unless
the receipt's own arithmetic backs the majority. That run scored it with the Python engine in
front, not the port the page actually runs.

This run scored what ships. On the 196 labelled photos of ExpressExpense's US receipt set, the
page now gets **190 totals right**, with one wrong total it doesn't warn about. That matches the
port alone and is one better than the vote without the rule.

## The tax that five readings agreed on

The rule cost two taxes, and one of them was not an OCR problem. It was a Honolulu breakfast slip:

```
Subtotal                     $42.75
Ohana Discount Breakfast      -3.30
HI 4.712% GET                  1.86
Total                        $41.31
Gratuity                       3.00
Total                         44.31
```

All five readings read the tax as 1.86. With the lead rule in place, the kept total was the last
one, 44.31. The vote has a repair for taxes that are one digit off: a "Tax 8.21" on a slip where
42.16 less 38.95 is 3.21 really was misread. That repair took 44.31 less 42.75, got 1.56, saw it
was one digit from 1.86, and replaced a tax every reading agreed on.

The gap between that subtotal and total isn't just tax. It also holds a discount and a gratuity.
The repair now stands aside when three readings agree on the tax and a gratuity or service line
is printed. Agreement alone isn't enough: tesseract repeats the same misread digit across its
readings, so three copies of "8.21" still get repaired. On SRD, taxes with the lead went from 165
to 166 of 185. No total moved.

## What's left

The other lost tax belongs to a receipt where the port read `Tax` and `Total` but no amounts, so
its "total" was the subtotal. A tesseract reading had the real total, but nothing on the slip
confirms it, so the page keeps the lead's number and tells you to check it. A rule that would fix
this one lost totals on the set the lead rule was tuned on, so it stays for now.

The CORD photo sets couldn't be re-scored from this session because their host refused the
connection. The [eval note](../../ventures/ai-bookkeeper/eval/rapidocr-web-lead-srd-2026-11-17.md)
lists what wasn't checked and how to reproduce every number.
