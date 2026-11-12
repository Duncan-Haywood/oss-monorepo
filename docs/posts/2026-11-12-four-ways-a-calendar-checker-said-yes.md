---
title: "Four ways our calendar checker said yes when it should have said no"
seo_title: "ICS checker fixes: empty TRIGGER, lowercase FREQ, DURATION"
date: 2026-11-12
tags: [ics-calendar-check, redteam, ventures]
description: "A red-team pass on our free .ics checker found four bugs: empty reminder durations, case-sensitive FREQ, unchecked DURATION and a repair that broke a line."
---

The [ICS calendar checker](https://marisstella.app/ics-calendar-check/) reads a `.ics` file in the browser and tells you what Google Calendar, Outlook or Apple Calendar will choke on. Today's red-team run attacked it, first by planting eight small bugs in its code to see how many its own tests noticed (five), then by reading it as a stranger with a strange file would.

The planted bugs found three blind spots in the tests. The reading found four real bugs in the checker. Each now has a test that failed before the fix.

## 1. An empty reminder passed

A reminder's `TRIGGER` is a duration, such as `-PT15M` for fifteen minutes before. The pattern that checked it made every part optional, so `TRIGGER:P` and `TRIGGER:-PT`, durations with no number in them, came back clean. RFC 5545 needs at least one number. The checker now rejects them, and `PT0S` (a reminder at the start time) still passes.

## 2. `freq=weekly` was an error

RFC 5545 section 2.1 says enumerated values are case-insensitive. The checker compared `FREQ` against upper-case names, so `RRULE:freq=weekly` raised "unknown FREQ weekly", and a following check on `BYDAY` then fired too. It was also quietly wrong the other way: `DTSTART;VALUE=date:20260106T150000Z` slipped past the "date with a time" error that `VALUE=DATE` gets. Both are read case-insensitively now.

## 3. DURATION was never checked

An event can end with `DTEND` or last for a `DURATION`. The checker looked at `DURATION` only to complain when both were present. `DURATION:1 hour` passed. So did `-PT1H`, an event that ends before it starts. Both are errors now, with a sentence saying what a valid one looks like.

## 4. The repair broke the line it fixed

The checker's one-click repair moves the end of a zero-length all-day event forward a day. It rewrote the `DTEND` line from its parsed parts and forgot the quotes: `X-NOTE="a:b"` came back as `X-NOTE=a:b`, and the colon inside then split the line in the wrong place. The repaired file had a new error that the original didn't. Values with a colon, semicolon or comma are re-quoted now, and the test checks the repaired file validates clean.

## What the tests missed

Of the three planted bugs that got through, one could not change anything a user sees. The other two now have tests: two edits of one recurring meeting were being keyed in a way that only worked by accident, and findings of the same severity weren't checked to come out in line order.

The second campaign planted eight bugs in the sales agent's holiday rules and seven were caught. The one that escaped was a typo in the Easter formula's rarest term, which is non-zero only in years like 1981, 2049 and 2076. The test now checks every year from 1583 to 4099 against a second, independent Easter algorithm.

Catch rate across both files: 12 of 16 before, 15 of 15 that can change behaviour after.

## Pointing the checker at our own calendars

Thirty-two other tools in this portfolio write `.ics` files: tax deadlines, league schedules, shift rotas, contract notice dates, a sales agent's meeting invites. A new test now feeds each one a small realistic input and runs the output through the checker. None produced an error. Ten wrote lines longer than 75 octets without folding them, which RFC 5545 says they should not; most importers cope, so that is a warning, and it is the next run's job.
