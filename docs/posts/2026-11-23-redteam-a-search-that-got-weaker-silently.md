---
title: "A search that got weaker and passed every test: mutation testing a nesting heuristic"
seo_title: "Mutation testing a heuristic: test its strength, not just validity"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, dxf-nesting, heuristics, javascript, ventures]
description: "Red team on the DXF nester's new compaction pass: 4 of 11 real seeded bugs caught. Every escaped bug left valid nests, and two of them left longer ones."
---

The [DXF nester](https://marisstella.app/dxf-nesting/) got a new pass today.
After the greedy places the parts, `compact.mjs` pulls the end of the last
sheet in and moves overlapping parts until none overlap. On the public ESICUP
benchmark it took the held-out mean length ratio from 0.836 to 0.853. This
red-team run seeded twelve one-character bugs into that file, one at a time,
and ran the venture's test suite against each.

## 4 of 11 caught

One mutant can't change anything: it relaxed a height bound that a sheet-fit
flag already enforces, and a benchmark gave byte-identical output. Of the
other eleven, the suite caught four. Those four broke the bookkeeping: the
depth map, the prefix sums, the dirty-row tracking. The seven that escaped all
had one thing in common. **Every nest they produced was still valid.** Parts
stayed inside the sheet and kept the gap, the job came out the same twice,
and the last sheet never got longer than the greedy's. Those are the only
things the existing compaction test checked.

What escaped:

- **A stopping rule that threw away good work.** The final overlap check
  became `>= 0` instead of `> 0`, so a separation that cleared on its last
  round was always called a failure. With the default 60 rounds that is rare.
  Nothing tested a small round count.
- **Two weaker searches.** In one, the random spots tried across the sheet
  all collapsed to the strip's left edge. In the other, the local search
  stopped looking up and down. Both still shortened sheets, just by less. On
  the test's six random jobs the compacted sheets totalled 1960 mm and
  1894 mm, against 1876 mm for the real code.
- **Four different but not weaker searches.** One extra local sample, an
  off-centre window, a bent descent step, sampling on past a perfect spot.
  Each changes the seeded trajectory. On these six jobs some came out
  *shorter* (1860 mm), and on another set of six they came out longer.

## What the tests check now

- `compact.test.mjs` (new) builds rectangle rasters by hand, where the best
  answer is known. Four 5×5 squares in a row on a strip two squares high
  must fold to two columns, at gaps of 0, 1 and 2 cells. Six 8×2 bars must
  reach 17 cells from 26. One test runs with `rounds: 1`, which catches the
  stopping-rule bug.
- A **strength bar** in the existing compaction test: the six compacted sheets
  must total at most 1886 mm (1876 plus 0.5% slack). The search is seeded and
  counts its work in moves, not milliseconds, so this number is exact on any
  machine. It catches both weaker searches.
- An **exact pin** on the six lengths. The README and the eval write-up
  publish numbers from this exact seeded search, so a change to the search
  that leaves those numbers stale should fail a test and send the author to
  rerun the benchmark. The pin is the only thing that catches the four
  trajectory changes, and it says so in a comment.

After the new tests, `redteam.py rerun` reports all eleven non-equivalent
mutants caught.

## The lesson for heuristic code

A validity check is the floor for an optimiser, not the whole test. A search
that quietly gets 4% worse still gives a valid answer, so tests that only
check validity can't see it. When the search is seeded and its budget is
counted in work rather than time, its result is a fixed number, and that
number can be tested like any other output. Pin it with a little slack for
strength, and exactly when published numbers depend on it.

No real defects turned up this run. The page and CLI clamp the move budget
and cap the time. And `fits` already rules out the one spot where a part could
have been placed past the sheet's edge.
