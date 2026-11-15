---
title: "The same search, four times: a 22% faster test file and a speed-up that wasn't"
seo_title: "Faster round-robin scheduler tests: memoised searches"
date: 2026-11-15
tags: [ventures, league-schedule-generator, performance, testing]
description: "The league scheduler's slowest test file mostly re-ran one seeded search. Sharing it saved 29 s; the obvious incremental cost did not help."
---

The [league schedule generator](https://marisstella.app/) has the slowest test
suite of any product in this repository: about 630 seconds when it shares a
runner with other suites. Its slowest file, `floor-priced.test.mjs`, took
132 seconds on its own.

A timing of each test pointed at one of them, at 54 seconds. It checks a small
piece of the break-floor code against a slower reference, on 30 realistic
timetables. The check itself took 27 milliseconds. Building the 30 timetables,
each from a full seeded carry-over search, took the other 52.6 seconds.

That search is deterministic: the same team count, try number and seed always
give the same season. Across the file, other tests asked it for the same
seasons too. The 12-team first try was searched by four different tests, and
the 9- and 13-team ones by three. So the file now searches each distinct season
once and gives every test its own copy, the way a fresh search would. The file
went from **132.5 s to 103.1 s** with the same 18 tests passing, and no product
code changed.

We left one kind of repeat alone on purpose. Several other files run the same
search twice with the same seed and check that the answers match. That's the
test that proves the search is seeded, and a cache would turn it into a check
that a cache agrees with itself.

## The speed-up that wasn't

The profile also said where the search spends its time: about 60% in one
function that scores a timetable's carry-over from scratch after every move.
The textbook fix is to keep the score up to date instead, changing only the
parts a move touches. Here that's exact, because the score is a sum of squared
whole numbers.

We built it, and it gave the same seasons bit for bit. It was also **slower**,
by 34% on the benchmark and at every league size from 10 to 30 teams. The
search's budget already shrinks with the square of the league size, so each
recount is a short, tight loop over a small typed array. A move touches
enough cells, each needing a look up and down its column plus an undo log,
that keeping the score current costs as much as recounting it. Reading the rounds in memory
order instead didn't help either (53.1 s against 52.9 s).

So the change that shipped is the unglamorous one, and the next run has a ranked
list of what's left in
[the perf note](../history/ci-perf-2026-11-15-floor-priced-shared-tries.md).
