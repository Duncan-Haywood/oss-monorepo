---
title: "The yen sign nobody stripped: red-teaming a revenue schedule"
seo_title: "Parsing ¥, ₹ and 'USD 100' in a deferred revenue CSV: a red-team find"
date: 2026-11-18
tags: [redteam, testing, stripe, revenue-recognition, csv]
description: "32 faults seeded in Rev Rec, 27 caught, every real hole closed; the code read found yen, rupee and 'USD 100' amounts skipped as not a number."
---

[Rev Rec](https://marisstella.app/rev-rec/) turns Stripe invoice lines, or a pasted CSV
export, into a monthly deferred-revenue schedule and the journal entries an accountant
posts. This red-team run attacked its recognition maths (`revrec.mjs`) and its CSV reader
(`csv.mjs`).

## The seeded faults

32 small faults went in, one at a time, with the product's own tests run after each. 27
broke a test. Of the five that got through, one could not change any output (`<` turned
into `<=` where both sides are then equal). Four were real holes in the tests, places where broken code would have shipped green.
Each is now pinned by a test:

- **Rejecting an October period close.** The month check `(0[1-9]|1[0-2])` could lose
  October without a test noticing: the tests closed January, February and
  December only.
- **Dropping a character after a line-feed and carriage return pair** in the CSV parser.
- **Reading a four-letter word after a number** ("100 EURO") as a currency code.
- **Shifting the demo's sample data by a day**: no test loaded it the way the page does.

## The real bug: only three currency signs

The tool already knows that yen and won have no minor unit and that dinars have three
(fixed in an earlier run). But the CSV reader only stripped `$`, `£` and `€`, and only a
currency code *after* the number. So these were all skipped, row by row, as "amount is
not a number":

| Written in the export | Read before | Read now |
|---|---|---|
| `¥12,000` (JPY) | skipped | 12,000 yen |
| `₹1,499.00` (INR) | skipped | 1,499.00 rupees |
| `₩50000` (KRW) | skipped | 50,000 won |
| `R$ 49,90` (BRL) | skipped | 49.90 reais |
| `USD 100` | skipped | 100.00 dollars |
| `kr 99` (SEK) | skipped | 99.00 kronor |

The page did say how many rows it skipped and why, so nothing was silently wrong. But a
Japanese or Indian user got an empty schedule. The reader now drops any Unicode currency
sign and a short code on either side. It still refuses `5k` and `12abc34` rather than
guessing what they mean.

## What's left

Five other products in this repository strip a short fixed list of signs (`$`, `£`, `€`, sometimes `¥`). Most are US-only
(QuickBooks imports, liquidation pallets, shift rosters), so it is not a bug there yet.
A later run should check the bookkeeping importer, which takes bank exports from
anywhere.

This is a working schedule for your bookkeeping, not accounting advice. Check it with
your accountant.
