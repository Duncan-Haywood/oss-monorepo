---
title: "The day Samoa skipped, and what it did to a recurring-event checker"
seo_title: "Samoa's skipped day and RRULE time zone gaps"
date: 2026-11-17
tags: [redteam, rrule-explainer, icalendar, time-zones, testing]
description: "A red-team pass found the RRULE explainer read long clock gaps with the wrong offset: Samoa's lost 30 December 2011 put two daily events on one instant."
---

On 29 December 2011, Samoa moved from one side of the date line to the other.
Clocks in Apia went from 23:59:59 on Thursday 29 December straight to 00:00
on Saturday 31 December. Friday 30 December never happened there. The tz
database records it as a jump from UTC-10:00 to UTC+14:00.

A daily calendar event at 12:00 in `Pacific/Apia` still has to land somewhere
on that Friday. RFC 5545, section 3.3.5, says what to do with a local time
that doesn't exist: read it with the UTC offset in force *before* the gap.
So 30 December 12:00 is read at -10:00, which is 22:00 UTC on the 30th, the
same instant as Saturday's 12:00 at +14:00.

## What the [RRULE explainer](../../ventures/rrule-explainer/) did instead

The explainer lists each occurrence of a rule with its UTC instant and marks
times that fall in a clock-change gap. To find "the offset before the gap" it
looked three hours before the moment of the shift. That works for every
daylight-saving change, since those gaps are an hour or less. A 24-hour gap
is longer than three hours, so the look-back still landed after the shift and
picked up +14:00. The rule

```
DTSTART;TZID=Pacific/Apia:20111228T120000
RRULE:FREQ=DAILY;COUNT=5
```

listed 30 December at `2011-12-29T22:00:00Z`, the same instant as the
29 December occurrence the line above it. The UTC column went backwards.
Kiritimati, which skipped 31 December 1994 the same way, did the same.

The fix doesn't use a fixed look-back. Read with the later offset, any
skipped wall time lands on an instant before the shift, so the offset at that
instant is the one the RFC wants, however long the gap. New York's skipped
02:30 and Lord Howe Island's half-hour change give the same answers as before.
The test pins all three cases.

## How the bug turned up

This was a red-team run: a script seeds small faults into the source, one at a
time, and checks whether the test suite fails. Of 12 faults in `rrule.mjs`,
8 were caught. One of the 4 that got through changed a two-day look-back to
twelve hours. Working out whether that could ever matter led to zones more
than 12 hours ahead of UTC, then to Apia's history, then to the real bug in
the line below it.

That fault turned out to matter too. With a twelve-hour look-back, Apia's last
daylight-saving end (4 April 2021, 04:00 back to 03:00) lost its earlier
reading of 03:30, and the explainer would have called a repeated hour an
ordinary one. There's a test for that now as well. Two of the other escaped
faults were plain test gaps: `BYMINUTE=-5` (minutes take no sign) and the
point where the English description stops listing clock times. The fourth
fault couldn't change anything a user sees.

After the new tests, all 11 faults that could change behaviour are caught.
A second campaign on the Australian redundancy pay calculator caught 10 of 10.

These dates are rare, but people do use the explainer to check rules against
historical data and odd zones, and a checker that disagrees with the RFC on
the rare cases is the kind people stop trusting.
