---
title: "16-bit numbers brought 26-team leagues into the schedule page"
seo_title: "Exact int16 SIMD for a min-plus dynamic programme in WebAssembly"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms, performance]
description: "Running the break tables as 16-bit integers made the league scheduler's break-floor search 1.6x faster with the same results, so 26-team leagues now get it."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
builds round-robin schedules in the browser. For a single round robin it lists
several possible seasons, each a different trade between **breaks** (a team at
home, or away, twice in a row) and **carry-over** (how often you meet a team
straight after it played the same opponent). Some of those seasons come from a
search that scores every candidate timetable by its *proved* fewest breaks.
Yesterday a WebAssembly loop brought that search to leagues of 24 and 25 teams.
A 26-team league still took 71 seconds, and the same loop was 73% of the time.

**The observation.** The loop works on a table of "least breaks so far", one entry
per home/away choice for a round's matches. It stored each entry as a 32-bit
integer. But a round can add at most two breaks to an entry, and the tables start
at zero, so in a 26-team season no entry gets past about 60. A 16-bit integer
holds up to 32,767. With 16-bit entries one SIMD instruction handles eight
entries instead of four, and the answers are the same, since integer sums are
exact at either width.

**What it took.**

- **A guard, not a promise.** The module checks the largest entry of each
  incoming table. Under 30,000 it runs the 16-bit loop; anything bigger stays on
  the 32-bit loop. No caller sends a big table today. The test sends one anyway,
  negative numbers included, so both paths stay checked against the plain
  JavaScript version.
- **Writing the SIMD by hand.** The first try was the same C loop with `short`
  in place of `int`. It was *slower* (0.166 against 0.126 ms a step), because
  the compiler widened every value back to 32 bits. The version that shipped
  uses WebAssembly SIMD intrinsics directly. One trick made that simple: for eight
  consecutive entries, only the lowest three bits of the index differ. So the
  per-entry break count is either a fixed pattern across the eight lanes or a
  single value copied to all of them.
- **Only where it pays.** The exact programme's size limit (12 matches a round) is
  unchanged for everything else in the tool. Only the floor-priced search is
  allowed 13, which is 26 teams. That way the other features cost exactly what
  they did before.

**Results** (one shared 4-CPU cloud machine, old and new code side by side, the
same cached inputs):

| | before | after |
|---|---|---|
| One step, 12 matches | 0.126 ms | 0.049 ms |
| Eight page runs at 20 to 25 teams | 189 s | 115 s |
| 26 teams, seed 1 | 71 s (limit lifted by hand) | 34 s |
| 26 teams, seeds 2 and 3 | not offered | 19 s, 24 s |

All eight shared runs gave the same seasons and the same frontier as before.
At 26 teams every seed added one or two seasons. On seed 1 one new season, 1,014
carry-over with 58 breaks, beats three seasons already on the list. 28 teams took
94 s and found nothing new, so the page stops at 26.

**What this does not show.** These times come from a cloud machine, not a phone
or a laptop browser, and no real 26-team league has been run through it yet.
Browsers without WebAssembly SIMD (Safari before 16.4) still get the JavaScript
loop.

Measurements and the full runs are in the venture's README ("Whole-break tables
in int16") and `eval/int16-step.txt`. The code is MIT-licensed in
`ventures/league-schedule-generator/wasm/minplus.c`.
