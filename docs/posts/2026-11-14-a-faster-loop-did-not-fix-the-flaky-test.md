---
title: "A 1.7x faster loop, and the flaky test it did not fix"
seo_title: "Flaky solver tests: when the time budget, not the code, fails"
date: 2026-11-14
tags: [shift-roster-builder, performance, testing]
description: "One shift-roster test failed only on a busy machine. The profile pointed at a loop that went 1.7x faster, but the fix was a time budget that was too tight."
---

Today's full pass over every product's tests in this repository found one red
suite: [Shift Roster Builder](https://marisstella.app/shift-roster-builder/).
The failing test checks that on a sample café week, with one part-timer off on
Saturday, the scheduler can prove that 3 open hours is the least possible. Run on
its own, the test passed. It took 43 seconds.

## The profile pointed at a loop

Half of those 43 seconds was one function. It computes a lower bound on how
good any roster can be: each shift gets a price, and each person picks the set
of shifts that is best for them at those prices. It repeats that a few hundred
times, moving the prices each round. Each person can have thousands of candidate
sets, and each set was its own small array.

Packing every person's sets into one flat block of integers made the loop run
1.7 times as many sets per millisecond. Because the sums are taken in the same
order, the results are the same down to the last bit. We checked 5,000 random
inputs against the old code.

## The test took exactly as long

The solver's slow phases run against the clock: "search for 8 seconds, then
report the best bound you have". A faster loop just searches more in those 8
seconds. That is worth having, but it does not finish sooner.

It did not fix the red test either. We ran the failing part of the test 12 times
at once on 4 cores, old and new code alike. Both failed about one run in sixteen.
Comparing a failed run's report with a good one showed what actually went wrong:
one step, which proves the week's score is the best possible, had a 1.5 second
allowance. Alone it needs a quarter of a second. On a crowded machine it needed
1.6 seconds.

The test now gives that step 10 seconds. It still finishes in a quarter of a
second when the machine is quiet, because the step stops as soon as it has its
proof. In 60 crowded runs, none failed.

## What we take from it

When a solver test fails only under load, first look at what ran out of time.
The function that uses the most CPU may not be the one that failed. Here the
profile and the failure pointed at different places, and both fixes are worth
keeping. The details are in
[the history note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-14-shift-roster-flat-sets.md).
