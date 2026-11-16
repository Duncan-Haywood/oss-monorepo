---
title: "A scheduling test that waited 8 seconds a call for a phase it never checked"
seo_title: "Speeding up a slow solver test without weakening it"
date: 2026-11-16
tags: [performance, testing, shift-roster-builder, optimisation]
description: "A shift-roster-builder test took 61 s because each call ran an 8 s exact search it never checked. At 300 ms it takes 13 s and catches the same faults."
---

The [shift roster builder](../../ventures/shift-roster-builder/) checks its rosters with a
chain of lower bounds. The roster is proven when one of them reaches its score.
One of those bounds comes from column generation, and a test makes sure that
column generation cut off early never claims a bound above the best roster.

That test took 61 seconds, the slowest single test in the suite. The phase
timer in the solver's output (`timings`) showed why. Each "cut short" call
spent 9.3 of its 10.6 seconds in the exact search, which runs *after* the
column generation under test. With the proof left open, the search ran to its
default 8-second limit on a week the test never looked at again.

The fix was one option on the test's cut calls, `exactMs: 300`. Shrinking a
budget can hide a bug, so before changing it we checked three things:

- **Both cut-short passes still run.** One runs inside the exact search (an
  "open-hours row" pass). At 300 ms it still ran on all six calls, as it did at
  8 seconds. At 1,000 ms it did not, because some first passes then finished on
  their own. So the shorter budget is not the larger one here.
- **Planted bugs are still caught.** Raising either pass's bound by a billion
  makes the new test fail. The test now also checks the inner pass's bound
  directly, so that failure names the pass.
- **The exact search keeps its own tests,** elsewhere in the suite.

The test now takes 13 seconds and the file 30 instead of 76. The solver itself
did not change. The rest of the suite's slow tests are mostly testing exactly
the budgets they spend, so the next win will not be this easy. The full reading
is in `docs/history/ci-perf-2026-11-16-shift-roster-cg-hardstop-exact-ms.md`.
