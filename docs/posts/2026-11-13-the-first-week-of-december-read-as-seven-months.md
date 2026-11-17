---
title: "The first week of December, read as seven months: red-teaming the schedule importer"
seo_title: "Schedule CSV import: day-first dates with no part over 12"
date: 2026-11-13
tags: [testing, mutation-testing, csv, dates, scheduling, redteam]
description: "Eight faults seeded into the schedule-export importer, two caught, and a real bug: a day-first week in early December came out as seven weeks."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) can take
a published-schedule export from another scheduler and turn it into the
shifts a week needs. That importer, `import-shifts.mjs`, learned to read two
real exports this morning, a Deputy timesheet file among them. Today's
red-team run seeded eight faults into it (`redteam.py campaign`: change one
operator or constant, run the venture's tests, put the file back) and then
read the code looking for a wrong answer.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `shift-roster-builder/import-shifts.mjs` | 8 | 2 | 0 | 6 of 6 |

## The real bug: dates that settle nothing

Deputy writes dates day first. The importer decides a file's order from the
whole file: one `13/05/2026` anywhere means day first, one `05/13/2026` means
month first. That works for a file that crosses the 12th of a month. A week
that does not cross it has no date to settle anything.

Paste in a week that runs 1 to 7 December 2026, written the Australian way
(`01/12/2026` ... `07/12/2026`), and the importer read it the US way: January
12, February 12, and so on to July 12. Each of those is a different weekday
in a different week, so the result was seven shifts spread over "7 weeks",
with no Monday and no Saturday, and no note saying the order was a guess. The
first twelve days of every month would do this to anyone outside the US.

The fix uses something the importer already knows: a published schedule
covers a week or a few. When no date settles the order, it now reads the
dates both ways and keeps the reading that puts them closer together. Read
day first, that December week spans 7 days. Read month first, it spans 183.
A note says which order it chose and why. When both readings give the same
spread (one date, say `05/08/2026`), it still reads month first, and now a
note says that was a guess and suggests exporting `YYYY-MM-DD`. The sales
importer next door already printed a note like that. The schedule importer
had none.

## What got through

Six of the eight seeded faults passed every test:

- **Two-digit years in date-time cells.** Requiring three or four year digits
  (`11/02/26 07:00` stopped splitting into a date and a time) failed no test.
  Every stamp in the tests had a four-digit year.
- **Seconds.** Two faults broke the step that trims `07:00:00` to `07:00`, one
  for single-digit hours and one for every hour. No test time had seconds,
  though Deputy and most databases write them.
- **A location in the first column.** Changing `>= 0` to `>= 1` made a
  `Location` header in column 0 invisible. The tests always put it later.
- **Two notes that should appear only sometimes.** "This file has several
  shift columns" and "The file has N locations" are for files with more than
  one. Loosening `> 1` to `>= 1` added them to every file, and no test checked
  that a plain file stays quiet.

One new test covers all six: a file with `Location` first, two-digit years
and seconds, checked for its shifts and its notes, plus a one-location,
one-family file that must produce neither note.

## What it does not show

The tests use made-up rows. The two real exports the importer was checked
on this morning are not in the repository, because they carry staff
personal data, so this run could not re-run them. Both are settled by a date
like `13/05`, so the new rule does not apply to them.
