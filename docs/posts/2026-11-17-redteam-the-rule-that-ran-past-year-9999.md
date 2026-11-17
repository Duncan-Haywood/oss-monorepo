---
title: "The recurrence rule that ran past the year 9999"
seo_title: "RRULE tester edge cases: huge INTERVAL, SECONDLY rules and a silent search cap"
date: 2026-11-17
tags: [redteam, rrule-explainer, icalendar, testing]
description: "A red-team run fed the RRULE Explainer hostile rules. Three answers were wrong or missing: a crash, a 53-second freeze and a false 'No dates'."
---

[RRULE Explainer](https://marisstella.app/rrule-explainer/) takes an iCalendar recurrence rule and lists
the dates it makes, in plain English, with the clock changes it crosses. Today's red-team run aimed at its
engine, `rrule.mjs`. It did two things: it seeded ten small faults to see whether the tests would notice,
and it typed rules a stranger might paste.

## How well the tests guard it

The tests caught 6 of the 9 seeded faults that could change what a user sees. The three that got through
were all in the findings, the notes the tool adds under the dates:

- the advice for a bad `COUNT` and a bad `INTERVAL` could be swapped;
- a normal `DTSTART:20260105T090000` could be told it needs `VALUE=DATE`;
- `BYYEARDAY` with `FREQ=MONTHLY`, which RFC 5545 forbids, could go unflagged.

Each now has a test, and a rerun of the three faults shows all three caught. A tenth fault moved an internal
search limit by one day and changed nothing a user can see.

## Three real defects

**A big INTERVAL crashed the page.** `FREQ=DAILY;INTERVAL=99999999` with a time zone puts the second date
about 273,000 years out. JavaScript's date and time-zone code stops near the year 275,760 and throws an error.
The page doesn't catch it, so the Run button just did nothing. Without a time zone, the page printed
five-digit years that no calendar file can hold, because iCalendar writes years with four digits
(RFC 5545, section 3.3.4). The list now stops at 9999-12-31 and says why.

**A rule that never ends listed "No dates."** Rules that repeat every second, minute or hour are checked
one step at a time, and the search stops after 3,000,000 steps. That is about five weeks for a
`FREQ=SECONDLY` rule. Ask that rule for dates from two months after it starts, and the search ran out
first. The engine recorded that it had stopped, but nothing read that record, so the page showed an empty
table. Now a warning says the search stopped early and more dates may follow, and the line under the table
says so too.

**One rule froze the page for 53 seconds.** The same kind of every-second rule, with a time zone and an
`UNTIL` in the year 9999, looked up the time zone at every step to check the end date. That is 3,000,000
lookups. But no time zone is more than 26 hours from UTC. So a step more than 26 hours before or after `UNTIL`
is clearly inside or outside it, and only steps within 26 hours need the lookup. The same input now
answers in about half a second. A test at UTC+14 (Kiritimati, the furthest-ahead zone) checks that the
last date is still exactly right.

## The guard that stays

A one-off test catches one bug. This run also left a seeded fuzz test: 50 random hostile rules (zero,
negative, huge and non-numeric values in every part, every kind of start, far "Show from" dates). It
checks that the engine always answers, never prints a five-digit year, and that the CSV export works. With
the year-9999 fix taken out, this test fails by itself. So the next bug in that class should fail CI,
without waiting for another red-team run.
