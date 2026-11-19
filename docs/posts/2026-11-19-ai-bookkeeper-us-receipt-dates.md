---
title: "Dates on US receipt photos: 63% to 93% once the reader learned how US tills print them"
seo_title: "Reading the date on US receipt photos: 63% to 93%"
date: 2026-11-19
tags: [ai-bookkeeper, ocr, receipts, dates]
description: "We read the date on 200 US receipt photos by eye and scored the receipt reader: 115 of 183 right. Fixing five causes took it to 171, with no new wrong dates."
---

[AI Bookkeeper](/ai-bookkeeper/) reads receipt photos on your own computer
and pairs each receipt with the bank line that paid it. A receipt is matched
on its total, on who you paid and on its date. The bank line has to fall
within a few days of the receipt. If the date is wrong, the receipt doesn't
pair with anything.

We had measured receipt dates on only one set of photos, SROIE: Malaysian
shop receipts printed day first (25/12/2018). The reader got 94% of those
right. Most people who use the page are in the US, though, and nobody had
checked US receipts.

## Labelling the dates

ExpressExpense gives away 200 phone photos of receipts, mostly US
restaurants and shops on thermal paper. Earlier runs had used them to measure
totals. This time four agent sessions each read the date and shop name on 50
of the photos by eye, with no OCR text in front of them. A reader who was
unsure of a single digit left the date blank instead of guessing. After
removing duplicates (one photo appears three times, under three names) and
unreadable dates, 183 dates were left to score.

The page reads each photo five ways: RapidOCR first, then tesseract in two
modes on the photo and on an enlarged grey copy. Of the 183 dates it got
**115 right (62.8%)**. Two were wrong and 66 came out blank.

## Why it missed them

Blanks don't sound as bad as wrong dates, but a receipt with no date still
can't be matched. Five causes covered nearly all of them:

1. **US tills write the month as a word, in shapes the reader didn't know.**
   `Feb23'19`, `MAR.19'17` and `25AUG'17`, with an apostrophe before a
   two-digit year, are what many restaurant systems print. Others print
   `13-Jul-2018`, `Jun 26, 15` or `SUN JUN 24 20:49:53 2018`. The reader knew
   `12 Mar 2026` and `March 12, 2026`, and none of these.
2. **RapidOCR glues the clock to the date.** `APR04'16 6:09PM` comes out as
   `APR04'166:09PM`. Sometimes the apostrophe is gone (`Jun221807:59PM`), and
   sometimes `Oct` is read with a zero (`0ct011701:44PM`). The reader now splits
   the digits after a month word only when a clock time follows, so
   `Add Mayo 2 12` stays a line about mayonnaise.
3. **Tesseract reads `$` as `£` on thermal paper.** The reader took the pound
   sign as a sign of a British receipt, so `05/11/18` became 5 November instead
   of 11 May. Now a pound sign counts only when an amount follows it, and a US
   phone number (`626-337-5666`) outweighs it. A US state with a ZIP code
   (`Gardena, CA 90249`) settles the order as month first. Words such as
   `SDN BHD` still mean day first, so the Malaysian receipts are unaffected.
4. **A date in the small print won.** `Sweepstakes ends 12/31/2017` beat the
   sale date above it. Dates on lines that say ends, expires, valid, until or
   return by now come last.
5. **Only the first reading's date counted.** Taking a date that just one other
   reading found was a coin toss on SROIE (9 right, 9 wrong), so it had been
   switched off. Now a date that at least two of the other readings agree on is
   taken, with a "check the date" note.

We also stopped accepting impossible years. RapidOCR once read `01/07/17` as
`4601/07/17`, and the reader had taken it.

## Results

| 183 US receipt dates | right | wrong | blank |
|---|---|---|---|
| before | 115 (62.8%) | 2 | 66 |
| **after** | **171 (93.4%)** | **2** | **10** |

Nothing became wrong that was right before. Both wrong dates were already
wrong. One was misread by OCR (`6/02` as `16/02`). The other is an Indian
receipt with no sign of its country in the text, read month first. The SROIE
dates, and the totals and tax on these same photos, did not change.

One caveat: all five fixes were written after looking at misses from all 183
photos, so there is no held-out half here. SROIE caught one regression while
the work was in progress. A Malaysian phone number briefly passed for an
American one, and the phone check was tightened before landing. The next fresh
set of US receipts will show how far these fixes carry.

The labels, the scorer and the write-up are in the repository:
`eval/srd/dates.jsonl`, `eval/srd-dates.mjs` and
`eval/srd-dates-2026-11-19.md`. The shop names were labelled at the same time.
The page gets 108 of 190 exactly right, so they are the next thing to work on.
