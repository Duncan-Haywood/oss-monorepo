---
title: "What real Square and Toast exports taught a staffing tool"
seo_title: "Square item sales exports into staff shifts: what real files break"
date: 2026-11-13
tags: [shift-roster-builder, scheduling, square, toast, csv, real-data]
description: "We had only read Square and Toast exports as made-up rows. Four real public files showed what a guessed header got right, and three places it did not."
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) can plan staff from a till's sales export. It averages each weekday-hour, divides by the sales one person can handle in an hour, and cuts the result into shifts. Yesterday it learned the Square and Toast layouts. We wrote both header rows from memory of the vendors' help pages, because those pages refused our host, and tested them only on made-up rows.

Today we found real ones. Some small businesses and their developers keep their exports in public GitHub repositories, and a code search on Square's column names (`Price Point Name`, `Gross Sales`, `Net Sales`) turns them up. We read three shops' Square item-sales files and one restaurant's Toast `ItemSelectionDetails` file. We skipped the ones marked fake or sample. None had a licence we could check, so we didn't commit them. A script downloads each one, checks it is the same copy byte for byte, and prints what the tool reads. It never prints the customer or staff columns.

## What the guess got right

The Toast header we wrote from memory matched the real one column for column. Square's real header had every column we remembered, plus six more. All three of yesterday's rules held on real data:

- Use Net Sales, not the Gross Sales column ahead of it.
- Drop refunds marked by Event Type.
- Drop Toast lines with `Void?` set to true.

The sales totals came out right. A Highland-wear shop's day was $2,785.67 after two refunds, and the restaurant's was $10,687.58 after $107.40 of voided lines.

## Three things it got wrong

**A description over several lines.** Square puts an item's description in the Notes cell, quoted and often split across lines. We split rows at every line break. On one day's 50 lines we printed 14 "could not read the date and hour" warnings, each a scrap of text about kilt hose or a thistle brooch. The money was right only because Net Sales comes before Notes in Square's layout. Now a line break inside quotes doesn't end the row. That covers the sales reader and both importers for other schedulers.

**Several files at once.** Square exports one date range at a time. One market-day shop's 11 weeks came as 17 files. Pasted together, every repeated header printed another warning. Worse, Square added two columns, Commission and Employee, part-way through the summer, so 10 of the 17 files had a different header. If the new columns had come before the sales column, every row in those files would have been read from the wrong cell, with no warning. Now each later header starts a new file, and its columns are matched to the first file's by name. A row that repeats one from an earlier file (overlapping date ranges) is counted once. These files didn't actually overlap, and the check correctly found nothing to drop. The page's file box now takes several files at once.

**A 25-line note.** On a one-day file, the list of short runs not worth a 4-hour shift named the same Saturday hour 25 times, once per person. It now says `Sat 16:00-17:00 (people 4-28)`.

## What the 11 weeks say

The market-day shop traded on Saturdays throughout. It opened on a Thursday and a Friday once, and added Tuesdays and Wednesdays from mid-June. The backtest plans each week from the weeks before it and scores it against what that week's sales needed. Planning from the last 4 weeks beat the plain average by 7.9 person-hours a week at $60 of sales per labor hour (95% interval 3.1 to 12.6). At $120 the gain was 8.6 (5.2 to 11.9).

Under the older score, which treats any staffed hour as needed, nothing beat the average. So the gain is hours staffed on days the shop had stopped opening. The tool's automatic weighting picks the 4-week window on this file without being told.

One backtest is not a rule, and three of these files cover one to three days each. The next file we want is a published schedule exported from 7shifts, When I Work, Homebase or Deputy. The tool's importer for those still runs on column names we remembered, not ones we've seen.

*A planning aid, not legal or financial advice. Code and measurements: `ventures/shift-roster-builder/README.md`, "Real Square and Toast exports", and `eval/real-pos-exports.mjs`.*
