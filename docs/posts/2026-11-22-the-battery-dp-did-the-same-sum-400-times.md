---
title: "The battery planner did the same sum 400 times per step"
seo_title: "Speeding up a battery dispatch dynamic programme without changing one answer"
date: 2026-11-22
tags: [perf, javascript, dynamic-programming, energy, demand-charges]
description: "Hoisting the per-step cost out of the inner loop made the demand-charge analyser's battery DP 2.4x faster, with every output bit-identical."
---

The [demand-charge interval analyser](https://marisstella.app/demand-charge-interval-analyzer/)
plans a battery against a utility bill: when to charge on cheap power, when to
discharge to shave the peak the demand charge is billed on. One part of that
plan is a dynamic programme over a month of 15-minute intervals (2,976 of
them) and up to 400 levels of stored energy.

For every interval, every energy level and every level the battery could move
to next, the programme worked out how much power the building would draw from
the grid, whether that broke a cap, and what it cost. A profile of the test
suite put this function at the top.

The thing to notice is that the grid draw and the cost depend on the interval
and on *how far* the battery moves, not on where it starts. Moving up three
steps from level 10 costs the same as moving up three from level 200. So the
same handful of numbers was being recomputed for every starting level, up to
400 times over.

The fix computes the cost of each possible move once per interval, then the
inner loop is just "cost of this move plus the value of where it lands", the
same order, the same tie-break. Because the arithmetic is unchanged, every
plan is bit-identical: a hash of the output on twelve synthetic months matched
before and after.

- The battery DP on its own: about 600 ms to 250 ms.
- The analyser's time-of-use test file: 3.1 s to 2.6 s (median of seven).
- The same function runs in your browser once per month when the page compares
  tariffs, so the page gets the same speed-up.

The rest of the test time is now the linear-programme solver, which is next on
the list, with a harder rule: its speed-ups change rounding, so they need a
tolerance test, not a byte comparison. Details in
`docs/history/ci-perf-2026-11-22-battery-dp-step-costs.md`.
