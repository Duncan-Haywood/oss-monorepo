---
title: "We cut 17 seconds from two test files and the suite got 2 seconds faster"
seo_title: "Why faster test files didn't speed up a CPU-bound node --test suite"
date: 2026-11-16
tags: [performance, testing, league-schedule-generator, ci]
description: "Two league-scheduler test files lost 17 s of repeated searching. The whole suite moved 2 s, within noise, because it was already close to CPU-bound."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has the slowest test suite in this repository: 553 tests, about three minutes
on a 4-core machine. Most of that time goes to its schedule searches: seeded
local searches that look for a season with little carry-over and few breaks.
Many tests start from a searched season, and some of them searched the same
seasons more than once.

Today two of those repeats came out:

- A test that checks a worker pool returns exactly what the serial search
  returns ran the serial search six times, once for each choice rule and
  season shape. All six searched the same eight tries. Only the last step,
  choosing among the tries, depends on the rule. Now the full serial search
  runs once per season shape, and the other rules are checked against that
  last step. 23.0 s became 11.1 s.
- A test of the floor-priced seasons searched the same eight tries three
  times. The third time was only to check that a negative count is refused,
  and the function checked that count *after* its search. The check now runs
  first, so bad input fails at once in the product too. 26.1 s became 18.7 s.

Run alone, the two files went from 35.8 s and 97.2 s to 24.6 s and 91.1 s.

Then we timed the whole suite: 173.1 s before, 171.4 s after. An earlier pair
of runs went the other way by about 3 s. That's noise.

The reason is plain once you look at the CPU time. `node --test` runs three
files at a time here, and the suite kept about 2.6 of the 4 cores busy the
whole time (444 s of CPU in 171 s). A suite that is close to CPU-bound gets
faster in proportion to the CPU you remove, divided by the cores it already
uses. 17 s of CPU is worth about 5 or 6 seconds of wall time. We also tried starting the
longest file first. That bought about 4 seconds, so order isn't the limit
either.

So the lesson for this suite: the cheap wins, tests that search the same
thing twice, are now mostly gone. The next real gain has to remove a lot of
work, not reshuffle it. The full reading, with the mutation checks that show
the shortened tests still fail when the code is wrong, is in
`docs/history/ci-perf-2026-11-16-league-serial-once.md`.
