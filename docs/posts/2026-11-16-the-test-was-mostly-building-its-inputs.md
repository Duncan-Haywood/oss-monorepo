---
title: "44 of a test file's 47 seconds went to building its inputs"
seo_title: "Profiling a slow test file: time spent building inputs, not testing"
date: 2026-11-16
description: "We logged every call to one search across our league scheduler's test suite. The code under test took about 3 seconds of one file's 47, and most repeated work belonged to the tests' own subjects."
tags: [league-schedule-generator, performance, testing, ci]
---

The [league schedule generator](../../ventures/league-schedule-generator/README.md)
builds round-robin seasons and then picks home and away for each game. Fewer
teams playing two homes or two aways in a row is better. Its test suite is the
slowest in this repository, at about 470 seconds when the files run one at a
time.

Most of the expensive work goes through one function, `carryOverTry`. It runs
one seeded search for a season timetable. To see where the time went, we added
a temporary log line to it, ran all 25 test files and recorded each call's
arguments and duration. There were 390 calls.

## One file was mostly setup

`orient.test.mjs` checks the break programme: given a fixed timetable, the
fewest home-or-away repeats any host choice allows, with a proof. It took 47.4
seconds. Of those, 44.4 went to `carryOverTry` building the timetables the
tests feed in. The programme under test took about 3 seconds.

Two of those timetables were built twice, by different tests: a 14-team
home-and-away season (4.4 s) and a 20-team season (0.9 s). The test file now
builds each timetable once and hands every test its own copy, so no test can
change another's input. The file went from 45.3 to 39.7 seconds, with the same
18 tests and the same assertions.

## Most repeats were the point of the test

The log found about 48 seconds of repeated searches across the suite. Outside
`orient.test.mjs`, every one came from code the test was checking. A test runs
the search one at a time and in a pool, then checks both give the same season.
Another runs the same settings twice to show the answer does not change.
Caching those would make the tests faster and also stop them testing anything.
We left them alone.

## What is left

The other 39 seconds in `orient.test.mjs` are distinct timetables. Saving
them as fixture files would bring the file down to about 4 seconds. But the
tests also check each timetable's carry-over and break counts, and that check
covers the search code too. A fixture would drop it. That is a decision about
what the test is for, not a speed fix, so the
[history note](../history/ci-perf-2026-11-16-orient-tries-memo.md) lists it
for a later run.

The suite-wide total (12% off one file, about 1% of the suite) is small. The
log is the more useful result: it shows where the suite's time goes and which
parts can be cut without weakening a test.
