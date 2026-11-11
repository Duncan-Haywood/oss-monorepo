---
title: "Shift roster builder: the same search, two to three times faster, and 80-person weeks proven"
seo_title: "A faster branch-and-price staff scheduler, same pivots"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, performance, open-source]
description: "Four exact speed-ups to a JavaScript branch-and-price solver: same nodes and rosters, 60-person weeks in 9-12 s, 80-person weeks proven where HiGHS stalls."
---

The [shift roster builder](../../ventures/shift-roster-builder/) proves its
rosters. It doesn't just say "here is a good week". It says "no roster of
these people can leave fewer hours open". The proof is a small
branch-and-price solver written in plain JavaScript. Earlier today it reached
60-person weeks in 18 to 27 seconds. Its open item was "80 to 120 person
weeks, untried".

So we tried them first. At 80 people and 224 shift lines, the old code had
not even finished the root linear program after 133 seconds. It had no
roster.

## Where the time went

A CPU profile of one 60-person week (19.4 s) showed three costs:

- **5.6 s sorting.** Each time the pricing oracle tried to add a shift to a
  person's list, it copied the list and sorted it with a comparator. The
  list was already sorted, so a binary insert does the same job.
- **5.1 s in the simplex refactor.** Every 64 pivots, and at the start of
  every solve, the solver inverts the basis by Gauss-Jordan elimination. The
  basis is a 0/1 matrix and the pivot rows are mostly zeros. Subtracting
  `f x 0` changes nothing, so those entries can be skipped.
- **4.6 s in the pivot loop.** The same skip applies to the pivot update.
  The loop also re-summed every basic value after each pivot, though only
  the rows the pivot touched had changed.

A fourth change came after the first three. The hard-rule check `validList`
built a Set, a Map and a sorted array on every call. It now uses a bit mask
of days and a reused array.

## The rule: not one pivot may change

Each change is exact. Every number comes out the same, so the solver takes
the same pivots, visits the same nodes and finds the same rosters. Two new
tests hold it to that:

- The old dense simplex is kept as a reference in
  `eval/solve-lp-dense.mjs`. On the two captured LPs, the new solver must
  match it bit for bit: pivots, basis, primal and duals, cold and warm.
- The old rule check is kept as `validListSlow`. On 90,000 random lists,
  sorted and unsorted, both must give the same answer.

On the 40- and 60-person bench weeks, the node, column, round and dive-step
counts match the old code exactly.

One idea failed that rule. Reusing the last round's basis inverse skips a
refactor per round. But its rounding differs, so the LP settles on other
optimal vertices. On two of three 60-person weeks the dive then missed and
the run got slower (25-31 s instead of 15-23 s). We dropped it.

## Results

Three benchmarks ran at once on a 4-core machine, so these times are on the
slow side.

| people x lines | before | after |
|---|---|---|
| 40 x 112 | 3 of 3 proven, 2.8-6.3 s | 3 of 3, 1.3-3.4 s |
| 60 x 168 | 3 of 3, 15.1-22.7 s | 3 of 3, 9.2-11.7 s |
| 80 x 224 | root LP not settled in 133 s | 3 of 3 proven (257, 331, 281 h), 77-100 s |

For an independent check, we gave the same 80-person weeks to HiGHS through
scipy, with a 300-second limit. It proved week 0 at 257 in 8 seconds. On
weeks 1 and 2 it stopped at the limit with rosters of 338 and 283 hours,
above bounds of 331 and 281. Those bounds are the values our solver proves
in under 100 seconds.

## Where it stops

The tool caps a week at 400 shift copies. At 100 people and 280 lines the
seeded weeks come to 400, 400 and 407 copies, so they are as big as the
product accepts. On the first 100-person week, the root LP did not settle in
180 seconds. Pricing took 128 s of that, with up to 1.4 million search nodes
for one person's best shift set. On the second week it stopped at 180 s with
a roster of 347 hours over a floor of 344. HiGHS, given 300 s, had 358 over
the same 344 on that week, and 361 over 358 on the first. The pricing oracle
is now the limit, not the LP. A faster oracle, using dominance, labels or a dynamic programme over
days, is the next item.

What this does not show: the weeks are seeded and synthetic, only the hard
rules are modelled, and everything ran on one machine. Every command and row
is in the venture README, under "Same search, two to three times faster", and
in `eval/cg-scale-bench.out.txt`.
