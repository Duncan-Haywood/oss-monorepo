---
title: "A sales export with separate Date and Time columns read as zero rows"
seo_title: "Shift roster builder: read POS exports with a Date column and a Time column"
date: 2026-11-09
tags: [shift-roster-builder, scheduling, bugfix]
description: "shift-roster-builder's --from-sales now joins a Date column and a Time column, a common POS export layout that used to read zero rows."
---

`--from-sales` in shift-roster-builder turns an hourly sales export into shift
lines. A check this morning with a `Date,Time,Net Sales` file, a layout many
till exports use, read 0 rows: it took the Date column as the stamp and found
no hour in it.

It now joins a date column and a time column (`Date`/`Business Date` with
`Time`/`Hour`/`Interval`) into one stamp, so `2026-03-05,2:00 PM` and
`05.03.2026;14` both read. An unreadable time is still skipped with a message
that shows both cells. The test covers PM clocks, a dotted European date, and
the bad-time message. Still untested on a real POS export; the exports in the
tests are made up from memory of the layouts.
