---
title: "A better OCR engine was losing three receipt dates in ten to a missing space"
seo_title: "RapidOCR glues receipt dates to the time: SROIE fix"
date: 2026-11-18
description: "On 313 held-out Malaysian receipt scans, RapidOCR's glued date and time cost the reader 31% of dates. Splitting them lifted dates from 69% to 94% right."
tags: [ai-bookkeeper, receipts, ocr, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) reads receipt photos on your own
machine and pulls out the merchant, the date and the total. With `--rapidocr --four-pass` it
reads each photo five times: RapidOCR leads and tesseract reads the same photo four ways. The
readings vote on the total, and the merchant and date come from RapidOCR, the stronger engine.

The vote had been tuned on Indonesian and US receipt photos. This run tried it on a set it had
never seen: SROIE, 626 scans of Malaysian shop receipts with the merchant, date and total
labelled by hand ([zzzDavid/ICDAR-2019-SROIE](https://github.com/zzzDavid/ICDAR-2019-SROIE),
MIT). Before changing anything we split it in half by receipt number: 313 to read misses from,
313 held out and scored only twice, before and after.

## Totals held up

On the held-out half the five readings got 302 of 313 totals right (96.5%). RapidOCR alone got
299 and tesseract's four alone 274. The rule that keeps RapidOCR's total unless the receipt's own
sums back the other readings was written from Indonesian photos. On these scans it added 8 totals
over a plain vote. That is a fair test of a rule on receipts it was not written from, and the
rule passed it.

## Dates did not

With RapidOCR leading, only 212 of 307 held-out dates were right (69%). Tesseract on its own did
better, at 79%. The misses on the first half all had the same cause: RapidOCR prints a line
without the space between the date and the time after it.

| printed on the receipt | RapidOCR's text | what the reader made of it |
|---|---|---|
| `25/12/2018 8:13:39PM` | `25/12/20188:13:39PM` | no date |
| `18-11-18 13:58` | `18-11-1813:58` | 18 November 1813 |
| `05 Mar 2018 18:24` | `05Mar201818:24` | no date |
| `17/01/2018 8.08.53` | `17/01/20188.08.53` | no date |

The date patterns wanted no digit straight after the year, which is a sensible guard against
serial numbers, so a glued time hid the date. The reader now puts the space back before it looks
for dates: a 20xx year glued to a clock time is split off, then a two-digit year, and a month name
gets its spaces back. A year before 1990 is no longer taken as a receipt's date.

On the held-out half, dates went from 212 to **289 of 307 right (94.1%)**, and wrong dates fell from
34 to 11. No total moved. Box text that a person corrected (SROIE's own, CORD's) reads exactly as
before.

## One more receipt

The same run fixed a leftover from an earlier note, a US restaurant slip. RapidOCR had read `Tax`
and `Total` with no amounts, so it guessed the largest amount on the slip. That was the subtotal,
28.48, and the lead rule kept it over one tesseract reading's `Total $30.76`. Now a lead that only
guessed gives way when its guess is a subtotal some reading prints, and the total line is at most
35% above it. The 35% cap is there because of a second slip, where "I agree to pay above total
133" would otherwise have replaced a correct 22.70. The CORD photos could not be fetched in this
session, so this change has not been checked against them. The
[evaluation note](../../ventures/ai-bookkeeper/eval/sroie-five-readings-2026-11-18.md) says so
and gives the commands to re-run it.

## What is next

Merchant names are the next weak spot: 67% exact with RapidOCR leading, against 85% from SROIE's
hand-corrected box text. The likely cause is the same missing spaces.
