---
title: "A held-out test of two receipt rules finds one stray zero"
date: 2026-11-16
description: "Two receipt-total rules written from 200 photos, tested on 625 unseen scans: one never fires, the other broke one receipt until narrowed."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

Earlier today [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) gained two rules
for picking a receipt's total when OCR reads a photo four times and the readings disagree
([the earlier post](2026-11-16-when-ocr-misspells-total-on-a-receipt.md)):

1. if a reading's subtotal plus its tax is printed somewhere on the page, that amount gets
   a vote, even when OCR mangled the word TOTAL next to it;
2. a total line whose dollars start with a 0 ("TOTAL: 04.78") is treated as a lost first
   digit and counts only half.

They lifted totals on the 200 public SRD photos from 151 to 154. But both rules were
written while looking at those photos, so that figure says little about receipts the
rules have not seen.

## The held-out set

SROIE 2019 has 625 scanned Malaysian receipts with a hand-labelled total. This run read
every scan four times with tesseract 5.3.4, exactly as the command-line tool does, and
scored the vote three ways: before the rules, with them, and with a fix.

| totals right | before | with the rules | with the fix |
|---|---|---|---|
| SROIE, 625 scans (held out) | 521 | 520 | **521** |
| SRD, 196 photos (in-sample) | 151 | 154 | **154** |

## What happened

Rule 1 never fired on SROIE. These receipts print the GST inside the total ("Bill Inclusive
of 6% GST"), and their total lines survive OCR, so nothing needs reconstructing. It is
harmless there, and it has not been tested there either.

Rule 2 fired once, and wrongly. Receipt 169 reads "Grand Total 029,30" in one reading and
"Grand Total VAS, x 30" in the other three. The 0 is a stray mark in front of an intact
RM29.30, not a lost 9 or 2. Halving that line's vote let a 3.00 from an item line win.

The fix uses what made the SRD case different: there, another reading said "TOTAL:
$94.78", the same digits with a real first digit. Now a leading-zero total counts half
only when some other reading offers that. Receipt 169 is right again, the three SRD gains
stay, and nothing else moved. A test pins both cases.

## What it means

Held out, the two rules now gain nothing and lose nothing; the +3 is still an in-sample
number. Testing rule 1 needs receipts with a separate tax line, read several times, that
nobody has looked at: the CORD photos would do, but their host refused this session.

Scores per receipt, and how to rerun:
[`eval/receipt-total-first-heldout-2026-11-16.md`](../../ventures/ai-bookkeeper/eval/receipt-total-first-heldout-2026-11-16.md).
