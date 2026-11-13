---
title: "Two real staff schedules: one store rewrote its week, one firm worked its roster"
seo_title: "Real Deputy and WFM schedule exports in a free shift scheduler"
date: 2026-11-13
tags: [shift-roster-builder, scheduling, real-data]
description: "Our schedule importer had only ever seen made-up files. The first two real exports it met, it refused. Fixing that turned up two very different posted weeks."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) has a
box for people switching from a paid scheduler: drop in a published-schedule
export and it turns the rows into "Mon, 9:00, 17:00, 2 people, server" lines to
plan from. Its column names were written from memory and tested on invented
files.

GitHub code search on header rows found two real exports sitting in other
people's public repositories. The importer refused both with "No start and end
time columns found". Both files also hold staff personal data, so we don't
commit or link them; the measuring script checks local copies by SHA-256 and
prints only counts and times.

## Why it refused them

Real exports describe each shift more than once.

- A **Deputy** timesheet export puts the worked shift (`Timesheet Start Time`)
  beside the rostered one (`Schedule Start Time`), mixes in leave rows, keeps
  the position in `Area Name` next to a nearly empty `Position` column, and
  writes dates day first without a leading zero: `8/05/2026`. Our old rule read
  that as 5 August.
- A retail **workforce-management** export pairs each person's day in the
  first-published schedule (`Initial Shift ...`) with the final one
  (`Final Shift ...`).

The importer now reads headers in families by their first word (schedule,
final, plain, initial, timesheet), uses one family for every row, prefers the
planned shift, and lets you pick another. It settles day-first or month-first
from every date in the file, drops leave and discarded rows, takes the fuller of
two role columns, and lists the sites when there are several, so you can plan
one. A Sunday-to-Saturday file now counts as one week.

## What the two weeks show

**The store rewrote its week.** Of 160 first-published shifts, 3 reached the
final week unchanged. Half kept the person and moved the times, mostly half an
hour earlier. Almost half had no final shift at all, a third of those being
draft slots with nobody on them. Hours fell 15%, from 1,246 to 1,062. The
draft may well be machine-made, but either way this store didn't treat it as
fixed.

**The security firm worked its roster.** Of 401 rostered shifts with a
timesheet, 93% started exactly on time and 95% ended exactly on time. Worked
hours were 0.1% under rostered. Where it missed was elsewhere: 11% of work
rows had no rostered shift behind them, and 8% of rows were leave.

That matters for the tool's posted-week features. When someone calls out, the
builder reissues the week while changing as few posted shifts as it can, and
shows a manager how many it changed. These files suggest the number worth
showing depends on the business. A store that redrafts freely won't care much,
while a firm whose roster is the work will. For the firm, the cost to model is
unrostered extra shifts, not drift in start times.

Two files are two files. Neither is 7shifts, When I Work or Homebase, and those
layouts are still from memory. The numbers and the script are in the venture's
README, "Two real schedule exports".

*Built by AI coding agents with the repository owner steering. A planning aid,
not legal or payroll advice.*
