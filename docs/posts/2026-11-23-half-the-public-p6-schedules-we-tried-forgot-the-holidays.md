---
title: "Half the public P6 schedules we tried stop listing holidays before the work ends"
seo_title: "P6 calendar review: holidays, hours per day, from an XER, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, calendar]
description: "A new calendar review in XER Schedule Check finds holiday lists that run out, mismatched hours per day and misnamed weeks. Three of six public P6 files had one."
---

Every date in a Primavera P6 schedule is counted on a work calendar. The
calendars are also the part of a schedule that reviewers read least: P6 shows
them one at a time in a dialog, and the DCMA 14-point assessment never opens
them. A calendar can still move the finish date without a single logic or
float fault turning up.

[XER Schedule Check](https://marisstella.app/xer-schedule-check/#calendars)
now reads every calendar in an XER (or a P6 XML or Microsoft Project XML file)
and lists what to fix. The guide is
[how to review the calendars in a P6 schedule](https://marisstella.app/xer-schedule-check/how-to-review-the-calendars-in-a-p6-schedule.html).

## The holiday list that stops

The commonest fault is simple. Someone builds a calendar with the public
holidays for the next year or two and never adds to it. From then on, every
Christmas, New Year and national holiday is a working day, and the forecast
finish is too early.

We ran the review on the six public P6 files the tool is tested on. Three of
them had this fault:

- **An airport terminal building.** Its one calendar in use, with all 66
  activities on it, lists holidays up to 24 December 2010. The work runs from
  May 2012 to February 2013.
- **A small sample file.** The holidays stop on 25 December 2013. The work is
  in 2021.
- **A hotel project.** One calendar lists holidays up to 2010, and 29
  activities on it run into 2013.

The review doesn't stop at "the list runs out". It copies the calendar's own
last listed year of holidays into each missing year, by date, and
reschedules. In all three files the finish moved about **two working days**.
Two days matters when a contract has liquidated damages.

## Two smaller faults in the same files

The same hotel file has a calendar named **"Standard 5 Day Workweek"** that
works seven 9-hour days and says it has 8 hours a day. P6 stores durations in
hours and shows them in days by dividing by an hours-per-day figure. On that
calendar, an activity shown as 10 days takes 8.9 of the calendar's days. And
anyone who put work on it because the name says five days has that work
running on weekends.

Another hotel calendar, "HCRA - Global", carries 1,103 open activities, works
Monday to Friday and lists no holidays at all. That might be deliberate, but
it should be asked about.

## How we know it finds them

The test deletes things from real calendars and checks that the review
notices. On the six files, each year of holidays inside a used calendar's
remaining work was deleted in turn. The review named the calendar and the year
16 times out of 16. Deleting a year before the data date raised nothing new
33 times out of 33. A planted hours-per-day mismatch was caught 12 of 12
times, and so was a planted wrong weekday count in a name. The controls
(correct figures, correct names) raised nothing in all 12 cases each.

The what-if is an estimate, and we measured how good it is. Seven of the
deletions moved the finish early, by 1 to 8 working days. The what-if then
put it back to within a day of the real holidays' finish in 4 of the 7. It
missed by 3 to 6 days when the year it copied from had a different holiday
list from the year deleted. Moving holidays such as Easter also land on the
wrong date. So read the what-if as "about two days", not as a date. The full
numbers are in the venture's `eval/calendar-review-2026-11-23.md`.

## Try it

Open an XER on the [tool page](https://marisstella.app/xer-schedule-check/),
then press **Review the calendars**. Nothing is uploaded. From the command
line:

```
node cli.mjs schedule.xer --calendars --csv calendars.csv
```

This is a screening check on your own file, not scheduling advice. A missing
year of holidays or a mismatched figure is a question for the scheduler.
