---
title: "The seller wasn't in the header: a second look at Russian receipts"
date: 2026-11-19
description: "Re-reading Russian slips in three enlarged bands finds the seller OCR missed. Held-out sellers go from 106 to 113 of 146, none lost, totals unchanged."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and matches each one to a bank line by merchant, date and total. On Russian slips it finds
the seller by its legal form: the line that opens with ИП (a sole trader), ООО, АО and so on. After
this morning's fix for misread forms
([post](2026-11-19-ai-bookkeeper-misread-legal-forms-on-russian-receipts.md)), it took the seller
on 106 of 146 held-out slips. Most of the remaining misses were the OCR's fault. The name was not
in the reading at all.

## The obvious fix looked in the wrong place

The notes from that run suggested reading the header again at a larger size, on the idea that
small type at the top of the slip is what the detector misses. Before running all 149 development
photos we checked where the seller's line actually sits on the slips where we did find it. It sits
anywhere from 10% to 91% of the way down, and on most slips between 44% and 70%. A Russian fiscal
slip often prints the seller in the fiscal block under the items, not at the top. A trial on the
top 35% of the photo, enlarged twice, found no seller that the whole photo had not already given,
so we dropped it.

## Three bands down the whole slip

The rule that worked reads the photo again as three overlapping strips: top, middle and foot (0
to 40%, 30 to 70% and 60 to 100% of the height). Each strip is enlarged twice before RapidOCR reads
it. RapidOCR caps the long side it detects on at 2,000 pixels, so a strip reaches the detector
about 1.7 times larger than in the first reading, and the small print shows up.

It only runs when it can help: the first reading is Russian and names no seller. A seller found
in the strips becomes the merchant. The total, the date and the items still come from the first
reading. Slips that already have a seller are never read twice, so the rule cannot lose one.

On the development split, the 19 labelled slips with no seller gained 5 with all three strips.
Any two strips gained 4, and one strip alone gained 1 to 3, so all three stayed.

## Held-out numbers

We committed the rule, then read the 151 held-out photos once through the CLI's own reader:

| split | slips read twice | seller taken as the merchant | lost | totals |
|---|---|---|---|---|
| development (149) | 21 | 117 to 122 of 146 | 0 | 139 of 145, unchanged |
| held out (151) | 36 | **106 to 113 of 146 (77.4%)** | 0 | 137 of 148, unchanged |

The cost is time. On one CPU thread the second look took about 17 seconds a slip, against about
3.5 for the first reading, and only the 14% to 24% of Russian slips with no seller pay it.

## What's still missing

On the development split, 17 sellers are still not in the text after the second look: misread,
cut off, or printed only as a shop sign. Another 7 are in the text but not taken, because the label
has no legal form or the name is misread too badly to match. The browser version of the reader
doesn't take the second look yet. That is next.

The full notes and the commands to reproduce the numbers are in
[`eval/receipt-ocr-ru-bands-2026-11-19.md`](../../ventures/ai-bookkeeper/eval/receipt-ocr-ru-bands-2026-11-19.md).
The dataset is [cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru).
No photo, reading or name from it is in the repository.
