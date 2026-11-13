---
title: "A schedule risk run that froze for 17 seconds, and the date string behind it"
seo_title: "Why our Monte Carlo schedule froze for 17 s"
date: 2026-11-13
description: "A 1,000-run Monte Carlo over a 40-activity house schedule took 16.6 s, mostly date strings built per calendar day. A memo made it 0.52 s, same output."
topic: infrastructure
tags: [performance, profiling, nodejs, construction, monte-carlo]
---

# A schedule risk run that froze for 17 seconds, and the date string behind it

The wall-framing takeoff tool has a schedule risk check. You give each activity
on your build schedule a minimum and maximum, and it runs 1,000 random schedules
to show P50, P80 and P90 finish dates and your chance of meeting the deadline.

We went looking for the slowest test in the repository's flagship projects and
found that check's property test: 6.4 seconds for about 60,000 tiny schedules.
That is roughly 100 microseconds for a schedule of at most eight jobs, far too
slow for so little work.

## What the profile said

Eighty percent of the time went to two small functions. One answers "is this a
working day?" and the other answers "what date is working day 37?". The second
counted forward from the start date, one day at a time, every time it was asked.
For each day it formatted the date as text to check it against your holiday
list, even when the list was empty.

A schedule asks that question twice for every activity, and the cash-flow table
asks it once for every working day of every priced activity. So the work grows
with the square of the schedule's length. On eight-activity test schedules that
is a few milliseconds. On a 40-activity house it is not:

| 40-activity house, 3 holidays, a deadline | before | after |
|---|---:|---:|
| 1,000 runs (the default) | 16.6 s | 0.52 s |
| 20,000 runs (the maximum) | 322 s | 9.3 s |
| the 60,000-schedule property test | 6.8 s | 1.8 s |

## The fix

Three small changes:

- Each schedule now remembers its working-day calendar as it extends it.
- Holidays are compared as timestamps instead of text.
- One leftover line in the statistics added up all the results again for every
  result (400 million additions at the maximum), so it now computes the mean once.

## How we know nothing else changed

A faster answer is only better if it is the same answer. We ran the old code and
the new code side by side on 4,000 random schedules with every option the tool
reads: holidays, weather days and monthly weather rates, crews and crew days
off, not-before dates, lags, costs and draw schedules, slips and deadlines. We
also ran 400 full risk runs. All 4,400 outputs matched byte for byte, and the
tool's full test suite passed.

As in [every earlier pass](2026-10-20-we-almost-rewrote-it-in-rust.md), the
slow part was not the language. It was one line doing the same work over and
over. The measurements and the remaining leads are in
`docs/history/ci-perf-2026-11-13-schedule-calendar-memo.md`.
