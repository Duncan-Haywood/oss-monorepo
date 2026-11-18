---
title: "14:75 is not quarter past three. Red-teaming the service load check"
seo_title: "Date.UTC rolls 14:75 into 15:15: validating clock times in JavaScript"
date: 2026-11-15
tags: [testing, mutation-testing, dates, javascript, redteam]
description: "16 faults seeded into the service load check, 11 caught. Three tools read an impossible clock time like 14:75 as a real one; a new CI check now tries them all."
---

Today's red-team run seeded 16 faults into
[the service load check](https://marisstella.app/service-load-check/), the tool
that reads a year of utility interval data and finds the measured peak an
electrician needs for NEC 220.87. Eight went into `interval.mjs` (the CSV and
Green Button reader) and eight into `greenbutton.mjs` (the shared ESPI XML
reader). `redteam.py campaign` applied each one, ran the suite and restored
the file.

The XML reader's suite caught all 8. The CSV reader's caught 3 of 8:

| Fault | Why it got through | Now |
|---|---|---|
| ISO day `\d{1,2}` to `\d{2,2}` | no test typed `2025-1-5` | test added |
| `12:xx AM` in a separate time column read as 1 AM | the AM test used a combined date-time cell | test added |
| end of the period `min * 60000` to `min / 60000` | nothing checked `to`, span or coverage on clean data | test added |
| `second >= 0` to `second > 0` | cannot change anything: the other timestamp column is never column 0 | equivalent |
| block sort comparator broken | rows reach it already sorted | equivalent |

So 11 of 16 caught before, and every non-equivalent fault caught after.

## The bugs a stranger would type

Reading the parser as an attacker turned up two real defects.

**A clock time that cannot exist was read as one that does.** `Date.UTC(2025, 0,
1, 14, 75)` is 15:15, not an error, and `h * 60 + m` does the same for a bare
time of day. A Green Button CSV with a corrupted line, `2025-01-01,77:30,77:44,9`,
put that reading three days after the rest of the file: the tool reported 3.2
days of data with 98.7% of it missing. Hours over 24, minutes over 59 and
`24:30` are now refused, and the line is counted as skipped.

**One missing line could halve the peak.** With no end column, the reader
guesses the meter's interval from the median gap between readings. It took the
upper median, so a short paste of 15-minute data with one line missing (gaps of
15 and 30 minutes) became "30-minute data": a 4 kW peak was reported as 2 kW,
coverage read 120%, and the page warned that hourly-style data understates the
peak. A missing reading only ever makes a gap longer, so the lower median is
the right one.

## Same bug, two more places

The sibling [demand-charge interval analyzer](https://marisstella.app/demand-charge-interval-analyzer/)
already caught 30 February rolling into March, but not minutes: `14:75` became
15:15 there too.

Rather than read every parser by hand, the run added
`platform/ci/check_clock_rollover.py`. It imports each module under
`ventures/` and `platform/` that exports a `parse…Time…`, `parse…Timestamp…`
or `parse…DateTime…` function, calls it with `14:75`, `2:75 PM`, `14:60` and
friends, and calls it again with the time each one rolls over to. A parser
fails only when both give the same answer, so a video-chapter parser that
reads `25:10` as 25 minutes 10 seconds is left alone.

Its first run found a third: the babysitting business kit's medication
authorisation form read `8:75pm` as 9:15 pm and `13pm` as 1 am. The dose
spacing check then compared a dose against a time nobody wrote. `toMin` now
refuses those, and keeps `24:00` as the end of a day, which the availability
grid uses.

The check takes under a second over 19 modules and runs on every venture pull
request through `unwired_checks.py`, so the next parser that hands raw hours
and minutes to `Date.UTC` fails CI instead of waiting for a red-team run.
