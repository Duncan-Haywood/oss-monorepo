---
title: "Our receipt reader on 472 receipts it was never tuned on: 88% of totals, and why taxes lagged"
seo_title: "Receipt OCR tested on 472 unseen WildReceipt photos"
date: 2026-11-17
description: "On WildReceipt's held-out photos the free, offline receipt reader got 88% of totals right. Glued tax words like MwSt19% hid taxes; fixing them added 10."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine: RapidOCR and tesseract read the photo, and a parser picks out the total and the tax,
checking them against the receipt's own arithmetic. For weeks it was tested on two sets,
CORD (Indonesian receipts) and SRD (US restaurant receipts). Both had been read so often that
their scores no longer said much about a receipt the rules had never met.

So this run tested it on a different source: [WildReceipt](https://arxiv.org/abs/2103.14470),
a research dataset of shop, restaurant, fuel and hotel receipts from the US, Europe, Asia and
Australia, with the total and tax boxes labelled by hand. About half the photos are small
(under 600 pixels on the long side).

**Before any change, 88% of totals were right.** On the 472 test photos, the command line's
five readings got 357 of 405 single-answer totals (88.1%). Tesseract alone got 72%. That is
the first number we have for receipts no rule was written from, and it is better than CORD's
held-out photos (about 58%) and a little under SRD's US photos (96%).

**Tax was the weak spot: 194 of 272.** RapidOCR alone left 100 labelled taxes unread. The
reason was mostly one thing: **RapidOCR drops spaces.** It prints `MwSt19% 2,46`,
`VAT14.5% Rs.18.12`, `Tax1: 2.79`, `SalesTax $0.38` and `TOTAL-TAX $1.85`, and the parser
was looking for the word "tax" with a space or a line edge either side of it.

**What we changed**, written from the misses on a separate set of 634 WildReceipt training
photos:

- A tax word glued to its rate or to the word before it is still a tax line.
- Lines that say "total" but aren't the total: `TOTAL SAVED`, `TOTAL INCLUDES GST OF 0.56`,
  French `Total HT` and Spanish `TOTAL SIN IVA` (both before tax), `Tax/Fee Total`.
- German `Netto 129,75` is the amount before VAT. (We had learned "Netto" as a total word from
  Indonesian receipts, where `Netto 137,500` really is what you pay.)
- Croatian `UKUPNO`, plus Polish, Czech and Turkish total words.

**Results on the held-out photos**, scored once after the change: taxes 194 to 204 of 272,
totals 357 to 359 of 405. The page in the browser went from 191 to 202 taxes. US photos
gained 2 taxes and lost no totals, and the hand-typed CORD text gained one tax.

**A caveat.** Before we moved development to the training photos, we had already printed the
test set's list of misses. Three of the "not the total" rules were first spotted there, then
found again in the training set. The tax rule, which brought most of the gain, came from the
training photos only. Every number and the full method are in the
[evaluation report](../../ventures/ai-bookkeeper/eval/wildreceipt-2026-11-17.md).

**What's left**: tax printed in a net / tax / gross column row, `EC$` read as `ECS`, and the
totals OCR loses entirely on small or blurred photos. The second training shard, about 630
photos, hasn't been read yet, so the next run starts there.

The receipt reader is free and open source, and it runs offline. Its results are a reading
of a photo, not accounting advice: check the totals before you file anything.
