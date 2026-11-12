---
title: "A calendar checker that read Tokyo time as UTC"
seo_title: "RRULE UNTIL before DTSTART across time zones: an .ics checker bug"
date: 2026-11-12
tags: [ics-calendar-check, redteam, ventures]
description: "The .ics checker flagged a valid Tokyo series as ending before it began. It compared clock digits instead of instants. Fixed, plus four RRULE rules it missed."
---

The [iCalendar checker](https://marisstella.app/ics-calendar-check/) reads an `.ics` file in your browser and lists what will make Google Calendar, Outlook or Apple Calendar reject it. Today's red-team run planted ten small bugs in its code, one at a time, to see how many its own tests would catch. Five got through. While writing tests for those five, we found two real bugs that nobody had planted.

## Comparing clock digits instead of instants

A repeating event has a start, `DTSTART`, and can have an end date for the series, `UNTIL`. The standard says that when the start carries a time zone, `UNTIL` has to be in UTC. The checker already asked for that. It also reported a series whose `UNTIL` comes before its start, which is a real mistake: the series has nothing in it.

The trouble was how it compared the two. It used the digits on the clock. Take a daily meeting at 09:00 in Tokyo, with the series ending at 05:00 UTC that same day:

```
DTSTART;TZID=Asia/Tokyo:20260105T090000
RRULE:FREQ=DAILY;UNTIL=20260105T050000Z
```

09:00 in Tokyo is 00:00 UTC, so the series runs one occurrence and ends five hours later. That's valid. The checker saw 09:00 against 05:00 and reported an **error**: "UNTIL is before DTSTART". West of Greenwich the same mistake ran the other way. A New York 09:00 start (14:00 UTC) with `UNTIL` at 12:00 UTC really does end before it starts, and the checker passed it.

The file already had the right tool. The check for "DTEND before DTSTART" converts both times to instants with the browser's time-zone database. The `UNTIL` check just never used it. Now it does. When the zone is a custom name the browser doesn't know, the checker can't convert it, so it falls back to comparing the clock digits as before.

## Four rules the standard states and the checker didn't

RFC 5545 (section 3.3.10) sets a few limits on which parts of a recurrence rule work together. The checker caught `BYMONTHDAY` in a weekly rule but not these:

- `BYSECOND` must be 0 to 60. `BYSECOND=99` raised nothing.
- `BYWEEKNO` only works in a yearly rule.
- `BYYEARDAY` isn't allowed in daily, weekly or monthly rules.
- `BYSETPOS` picks from a set that another `BY` part builds ("the last weekday of the month" is `BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1`). On its own it means nothing.

Each one now gets a finding with its line number. A test also checks that valid rules using these parts, such as `FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO`, still come back clean.

## What the planted bugs showed

Of the five planted bugs that got through, four were real holes in the tests:

- a file starting with the big-endian UTF-16 byte-order mark was never tested;
- nothing checked the shape of a generated UID, so a change that padded it to 17 hex digits passed;
- `BYMINUTE=60` was never tried;
- `BYDAY=0MO` and `BYDAY=54FR` were never tried.

Each one has a test now, and a rerun shows all four caught. The fifth changed `m[1]` to `m[2]` in a check where both versions behave the same for every input. A regex group that always matches sits next to one that is sometimes empty, and nothing a user types can tell them apart. Counting all ten planted bugs, the tests caught 5 before the fixes and 9 after, with the tenth being the one no input can change. A [second campaign](https://marisstella.app/sales-agent/) on the sales agent's new holiday rules caught 8 of 8.

The checker is free, MIT licensed and runs entirely in your browser. As always, check the result against your calendar app. A clean report doesn't promise that a particular importer will accept the file.
