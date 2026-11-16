---
title: "One blank line moved every error message"
seo_title: "CSV row numbers that drift after a blank line, fixed in 49 copies"
date: 2026-11-16
tags: [ventures, redteam, csv, testing]
description: "34 free report analyzers named the wrong line when they skipped a row after a blank line or quoted line break. The fix covers 49 parser copies, with a check."
---

Many of the free report analyzers on [marisstella.app](https://marisstella.app/)
read a CSV export: a delivery-app payout report, an Etsy statement, a Shopify
payout file, a KDP royalty report. When a row can't be read (a date that isn't a
date, an amount that isn't a number) the page says so: "line 3 skipped, date not
readable". The idea is that you open the file, go to line 3 and see what went
wrong.

Until today that line number was often wrong.

## How it went wrong

The analyzers share one small CSV parser, copied into 49 files. It does two
sensible things: it drops blank lines, and it keeps a line break inside a quoted
field ("Joe's order\nno onions") as part of one value. Both mean a row's position
in the parsed table is not its line in the file. Forty-one row loops in 34
analyzers still reported "row index + 1" as the line.

So an export with one blank line after the header, which many spreadsheet tools
write, pushed every later message up by one. A note field with a line break in it
did the same. On the [restaurant delivery commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/),
this file:

```
Order ID,Platform,Order date,...      line 1
A,DoorDash,2026-06-01 12:00,...       line 2
                                      line 3 (blank)
"B                                    line 4
note",DoorDash,2026-06-01 12:30,...   line 5
C,DoorDash,not a date,...             line 6
```

reported the bad date on line 4, which is the start of a perfectly good order.
It now says line 6.

The totals were never affected: the rows themselves were read correctly. Only
the pointer back into your file was off.

## The fix, and the check that keeps it

Each copy of the parser now counts physical lines as it reads, including the
breaks inside quotes, and gives every row the line it starts on. The value is
attached so it doesn't show up when a row is compared or printed, so nothing
else changed. Each of the 41 loops reads that line and falls back to the old
number only when a table didn't come from the parser.

One test fixed one copy. The other 48 needed something that runs on every pull
request without anyone remembering it. A new check imports every copy of the
parser, feeds it a file with a blank line, a quoted line break, a Windows line
ending and no final newline, and expects lines 1, 3, 4 and 7. It also rejects a
row loop that goes back to "index + 1". A new analyzer that copies the old parser
now fails its own pull request.

## Found by seeding bugs

This came out of a red-team run, where we plant small bugs in a file and see
whether its tests notice. Of 24 planted bugs in the delivery commission analyzer,
the tests caught 17 (71%). Two of the seven that got through pointed at real
behaviour nobody had pinned: a file with no final newline, and a date written
"6/3/2026" with a one-digit day. Both work, but nothing would have noticed if
they stopped. Eight new tests later, all 24 are caught. (The tool re-checked
23 of them automatically; the parser fix rewrote the line of the last one, so it
was re-planted by hand, and the new no-final-newline test fails on it.)

All 49 affected analyzers' test suites pass with the change. The code is MIT
licensed, as always.
