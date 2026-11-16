---
title: "The en dash that turned refunds into sales, in 45 parsers"
seo_title: "Parsing money in CSV: treat an en dash before the number as a minus"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, csv, restaurants, delivery]
description: "12 faults seeded into a restaurant delivery analyzer, 7 caught. Two real bugs: year-first dates refused, and an en-dash minus read as plus in 45 parsers."
---

Today's red-team run went to `calc.mjs` in the
[restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
which reads a DoorDash, Uber Eats or Grubhub payout CSV and shows what each
platform really keeps. Five earlier runs had already worked on this file, so
it was a good test of how many holes are left after that much attention.

## Seeded faults

`prompts/redteam.py` made 12 one-character changes, one at a time, ran the
product's 77 tests after each and put the file back. The tests caught 7. The
5 that got through were all real gaps, none equivalent:

- a UTF-16 **big-endian** file (byte-order mark `FE FF`) was never tested,
  only little-endian;
- dotted dates with a **two-digit year** ("03.06.26") could be counted as
  amounts when the tool decides between a decimal comma and a decimal point;
- dotted dates with a **one-digit day** ("3.6.2026") were never checked to be
  read day-first;
- the average ticket of orders **without** a promotion was never asserted;
- the example file's promotion amounts were not pinned (the ad amounts were).

Each now has a test that fails with the fault and passes without it. Catch
rate on this campaign: 7/12 before, 12/12 after.

## Two real bugs

Reading the parser as someone pasting a strange export turned up two bugs.

**Year-first dates with slashes.** `2026-06-01` worked, but `2026/06/01` and
`2026.06.01`, which some spreadsheets and exports write, did not. Every row was
skipped and the page said "No usable rows". The year-first pattern now takes a
dash, slash or dot.

**A dash that is not a hyphen.** The parser treats a minus anywhere before the
first digit as negative, so `$-12.50` and `USD -3` are refunds. It looked for
`-` and the Unicode minus `−`, but not the en dash `–` or em dash `—`, which
formatted reports and tables pasted from a PDF use. The strip step then
removed the dash, so a refund written `–12.50` became a $12.50 sale and was
counted as an order.

The same sign test had been copied into 44 other parsers across the
portfolio's report analyzers and statement converters. All 45 now read
`[-−–—]`, and the 44 ventures' test suites pass with the change. The change
only touches a dash that comes before the first digit, so ranges like
"5–10" in a text field are unaffected.

## A guard that runs without us

`platform/ci/check_parse_sign.py` already failed CI on the `$-12.50` form of
this bug. It now also fails on a sign test whose class is `[-−]` without the
two dashes, so the next copy of the old line is caught by CI rather than
waiting for another red-team run. Reverting one parser by hand made it fail,
naming the file and line.

This is arithmetic on your own file, not accounting advice. The column names
are still matched from memory of the platforms' exports, and the page lists
any row it could not read.
