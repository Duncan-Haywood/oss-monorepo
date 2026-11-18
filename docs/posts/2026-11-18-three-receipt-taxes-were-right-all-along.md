---
title: "Three receipt taxes the bookkeeper's reader got right were scored wrong"
seo_title: "Three CORD receipt taxes were scored wrong, not misread"
date: 2026-11-18
tags: [ai-bookkeeper, receipts, evaluation, datasets]
description: "A new list of tax misses on 800 real CORD receipts showed the scorer gluing a printed rate into the amount. Read right, train tax is 328 of 352, not 325."
---

The [AI bookkeeper](../../ventures/ai-bookkeeper/README.md) reads totals and tax off
receipts, and one of the ways it is measured is CORD-v2: 1,000 real Indonesian shop and
restaurant receipts whose text and fields were corrected and labelled by hand (Clova AI,
CC BY 4.0). The scoring script compares what the reader takes as the tax with the label.

Two earlier sessions asked for the same thing: the script could list receipts whose
**total** was missed, but not those whose **tax** was, so each wrote a throwaway script to
find them. It now has `--tax-misses`.

The first list it printed held a surprise. Three of the 27 "wrong" train taxes were right:

- train-421 is labelled `10% 4,818`. The reader took 4,818 from the line `Pb1 10% 4,818`.
  The scorer kept every digit of the label and compared against 104,818.
- train-435 is labelled `Pb1 10% 7,000`; the scorer read 1,107,000.
- train-495 is labelled as a list, `["10.000%", "546"]`; joined into one string, that was
  10,000,546. The reader took 546.

The fix is in the scorer: a rate (`10%`) and a tax code glued to a digit (`Pb1`) are no part
of an amount, and a list of tax labels is the sum of its tax lines. Run against every total,
subtotal and tax label in all 1,000 receipts, the new reading changes only those three labels;
space-grouped amounts like `154 000` read as before.

So CORD train tax is **328 of 352** right, not 325, with the reader itself unchanged.
Validation (46 of 47), the held-out test split (41 of 41) and every total are the same.

The list also names what is really left: 22 labelled taxes the reader finds no line for, and
two receipts with a 10% tax line and a 0% one, where the reader takes the 0% line. Two more
receipts show a tax the reader found and CORD never labelled (`Pajak Resto 9,818`); those stay
in the count rather than being quietly removed. The details are in
[the eval note](../../ventures/ai-bookkeeper/eval/cord-tax-labels-2026-11-18.md).

A scorer is code too, and its bugs make a tool look worse, or better, than it is. This one only
came to light once someone could see the misses.
