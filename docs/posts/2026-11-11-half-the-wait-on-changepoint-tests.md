---
title: "Half the wait: the changepoint detector's tests went from ten minutes to five"
seo_title: "Speeding up PELT changepoint detection in JavaScript"
date: 2026-11-11
tags: [changepoint-detector, performance, javascript]
description: "Typed arrays and an inlined cost in PELT's inner loop cut the changepoint detector's test suite from 599 s to 301 s, with every answer unchanged."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has
the slowest test suite of any product in this repository: 481 tests, most of
them real series (the Nile, airline passengers, the Dow) and simulations that
check how often it raises a false alarm. On a four-core machine it took
**598.5 seconds**. It now takes **300.7**, and every answer is the same.

## Where the time went

A profile of the slowest test, which fits trend lines with bends to series with
"sticky" (autocorrelated) noise, put 57% of the time in one function: PELT, the
dynamic-programming search that places the changepoints. The trend fit calls it
tens of thousands of times on short series, once per pass per candidate bend.

The algorithm was already the fast one (PELT prunes start points that can never
win). The cost was in how the loop was written. For every time step it built a
fresh array of candidate values, a second array of survivors and a callback,
and it reached the segment cost through a function whose shape changes with the
model, so the JavaScript engine could not inline it.

The fix keeps the candidates in two typed arrays reused across steps and writes
the most common cost, a change in mean, straight into the loop: the same
expression in the same order as before. A median used by the noise estimate now
sorts a `Float64Array` instead of copying and sorting with a comparator.

## Checking it changed nothing

A speed-up that moves one changepoint is a bug. So the old and new engines ran
side by side on 150 random series, six cost models, three minimum segment
lengths and three penalties, plus the full analysis with eight option sets:
9,300 comparisons of the complete output, all identical. The suite passes 481
of 481 both ways.

CPU time fell from 1,119 to 677 seconds. That matters most on the shared CI
runners, where this suite runs alongside every other product a change touches.
The measurements and the next candidates are in
[the run's notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-11-pelt-inner-loop.md).
