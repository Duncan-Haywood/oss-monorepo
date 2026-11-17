---
title: "The slowest recurrence rule is the one that never happens"
seo_title: "Why an RRULE with no dates is the slowest to expand"
date: 2026-11-17
tags: [performance, rrule-explainer, ical]
description: "In our RRULE explainer, 456 of 3,200 test expansions produced no dates and took 92% of the time. Testing only the days a rule could match made them 5x faster with identical output."
---

[RRULE Explainer](https://marisstella.app/rrule-explainer/) lists the dates an
iCalendar recurrence rule produces and explains why some months get skipped.
Its tests check it against python-dateutil on 1,600 random rules. Today we
looked at why that check took 7 seconds.

## Where the time went

Timing each of the 3,200 expansions on its own showed something we did not
expect: **the 456 rules that produce no dates at all took 6.3 of the 6.9
seconds.**

Take `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30`, "every 30 February". You
cannot tell it is empty by looking at one year, so the engine searches 400
years (the Gregorian calendar repeats every 400 years, so after that it can
say "never" rather than "not yet"). It used to test every day of each year:
about 146,000 checks to find nothing.

## The fix: ask the rule which days it could match

Most rules name their days. BYMONTH=2 rules out eleven months. BYMONTHDAY=30
leaves one day per month. BYYEARDAY, BYWEEKNO and BYDAY (including "the
second Tuesday" and "the last Friday") each give a short list too. The engine
now builds the shortest of those lists for each year or month and runs the
full check only on those days. Every filter still runs, so the dates come
out the same. Days that could never pass are just skipped.

## How we know nothing changed

- 10,536 expansions hash to the same SHA-256 before and after.
- 4,000 random inputs across all seven frequencies, with exclusion dates and
  time zones, came out byte-identical between the old and new code.
- A new test checks that for 300 random rules over 30 years, the shortlist
  never drops a day the full check would pass. We broke the shortlist three
  ways on purpose, and the test caught each one.

## Result

The test suite went from 13.2 s to 5.7 s. The rules with no dates went from
6.3 s to 1.1 s. The page runs the same code in your browser, so a rule that
never happens now gets its answer about five times sooner. The full numbers
are in [the perf note](../history/ci-perf-2026-11-17-rrule-candidate-days.md).
