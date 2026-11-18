---
title: "The test that passed by waiting for an array to break"
seo_title: "A node test that passed by exhausting V8's array length"
date: 2026-11-15
tags: [perf, testing, ci, ventures, open-source]
description: "A league scheduler test asserted a throw and got one, 4 s and gigabytes later, from an endless loop. That and a shared search cut two tests from 81 s to 18 s."
---

The [league schedule generator](/league-schedule-generator/) has the
slowest test suite in the repository: 520 tests, about four and a half minutes
on four cores. Today's performance run looked at its two most wasteful tests.

## A throw is not always the throw you meant

One test checks that a search runs for 22 to 26 teams and is skipped at 27.
To avoid running a real search, it passes a fake season with empty rounds and
asserts that the call throws. Getting a throw at all shows the size gate let
the call through.

The call did throw, but 3 to 4 seconds later per size. A loop that follows a
cycle of opponents never got back to its start on an all-zero table, so it
kept pushing onto an array until V8 refused: `RangeError: Invalid array
length`. The test passed for the right reason by the wrong route, and it held
gigabytes of memory for 22 seconds to get there.

Now the fake rounds have no match list, so the first read throws at once. The
test asserts the error message too, so a throw from somewhere else can't pass
it. That brought it from 26 s to about a millisecond.

## The same ten searches, six times

The other test checks the "most even carry-over" choice. It ran the full
best-of-ten search six times: three trade-offs, with and without the
carry-over-only season. But none of the ten searches depends on the trade-off.
They are the same every time, and only the final pick differs. Now the test
runs them once, checks that combining them gives exactly the full search's
answer, and checks each trade-off from the shared results. A small direct
search covers the one rule the sharing could hide: a pick above zero must not
keep the carry-over-only season. Breaking that rule in the source fails the
test. That took it from 54 s to 18 s.

## The numbers

| | before | after |
|---|---:|---:|
| the two tests | 80.7 s | 18.0 s |
| whole suite, wall | 279 s | 252 s |
| whole suite, CPU | 738 s | 667 s |

The same 520 tests run, and no assertion was removed. The measurements and the
next targets are in
[the run's notes](/docs/history/ci-perf-2026-11-15-league-tests-shared-tries.md).
