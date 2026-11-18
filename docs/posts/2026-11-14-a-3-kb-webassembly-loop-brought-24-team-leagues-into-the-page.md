---
title: "A 3 KB WebAssembly loop brought 24- and 25-team leagues into the schedule page"
seo_title: "Speeding up a min-plus dynamic programme with WebAssembly SIMD"
date: 2026-11-14
tags: [ventures, league-schedule-generator, algorithms, performance]
description: "Moving one hot loop to WebAssembly made the league scheduler's break-floor search 4x faster, same results, so 23 to 25 team leagues now get it in the page."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
builds round-robin schedules in the browser. For a single round robin it shows a
list of possible seasons, each a different trade between two things organisers
care about. One is **breaks**: a team playing at home, or away, twice in a row.
The other is **carry-over**: how often you meet a team straight after it played
the same opponent. Part of that list comes from a search that prices every
candidate timetable by its *proved* fewest breaks. That search ran for leagues of
up to 22 teams. At 24 teams it took 90 to 180 seconds in a background thread,
which was too slow to offer.

**Where the time went.** Most of the search is one step of a dynamic programme.
The step takes a table of "least breaks so far" over every home/away choice for
one round's matches, 4,096 entries at 24 teams, and produces the next round's
table. An earlier change had already replaced the obvious 4,096 x 4,096 double
loop with a much cheaper elimination. Even so, a CPU profile showed that step's
inner loop taking 94% of the search.

**What changed.** That inner loop is now about 40 lines of C, compiled with
clang to a 3 KB WebAssembly module with SIMD. The module ships inside the page
as a base64 string. A browser without WebAssembly or SIMD gets the old
JavaScript loop. Three details mattered:

- **The same answer, bit for bit.** Some of the search's tables hold
  fractional prices. JavaScript computed `(T + both) - d`, and
  `T + (both - d)` can round differently in the last bit, so the C keeps the
  JavaScript order. A test compares the two versions on 240 random rounds of 2
  to 16 matches, for whole-number and fractional tables. Every search finds the
  same seasons as before.
- **A flat loop vectorises.** The first version looped over the high bits, then
  the low ones. In the late steps the low loop ran only one or two entries. The
  old table's pair for entry `z` sits at `2 (z mod 2^(lx + ly0))`, so the new
  table is a run of blocks that each read the same stretch of the old one, and
  the break count comes straight from `z`'s own bits.
- **The rest had to move too.** With the step about 5x faster, the shuffles
  that copy a table in and out became 20% of the profile. So did building
  each round's home masks one bit at a time. The shuffles now run inside the
  module from the same two lookup tables. The masks are built one XOR per
  entry: each choice differs from the choice without its lowest set bit in one
  match's host.

**Measured.** Old and new code ran side by side on one 4-CPU machine, from the
same cached season lists (`eval/wasm-step.txt` in the venture):

| Teams, seed | before | after | seasons added (the same in both) |
|---|---|---|---|
| 24, 1 | 89.7 s | 21.3 s | 614/62, 640/60 |
| 24, 2 | 110.5 s | 25.6 s | 620/62, 610/62 |
| 24, 3 | 178.0 s | 41.9 s | 610/62 |
| 25, 1 | 60.3 s | 16.1 s | none |
| 25, 2 | 211.3 s | 50.4 s | 715/47 |
| 25, 3 | 132.0 s | 34.0 s | none |
| 23, seeds 1 to 3 | 23 to 57 s | 5 to 11 s | none |

Over all eleven runs, which also covered 20 and 22 teams, the total fell from 903 seconds to 218,
with the same seasons every time.

The step alone is 0.80 ms to 0.15 ms at 12 matches a round. Without SIMD the
WebAssembly build takes 0.21 ms, so most of the gain is from leaving JavaScript
and SIMD adds about a third.

**What a user sees.** The page now runs this search for leagues of up to 25
teams, not 22. At 24 teams it adds one or two seasons that cut the least
carry-over inside the widest break gap by 6 to 18%. That is the gain the
search had already found offline; until now it could not run in the page.

**Not claimed.** These are times from one shared cloud machine, not from a
phone. No real organiser's league of 24 teams has been tried. At 23 and 25
teams the search often adds nothing, and now it costs about 15 to 50 seconds
in a worker (5 to 11 seconds at 23) to find that out.
