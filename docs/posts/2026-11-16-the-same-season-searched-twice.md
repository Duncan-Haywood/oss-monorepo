---
title: "The same season, searched twice"
seo_title: "Finding repeated searches in a round-robin scheduler's test"
date: 2026-11-16
tags: [ventures, league-schedule-generator, performance]
description: "One test checks a guide page against real football fixture lists. A quarter of its 18 seconds was the scheduler repeating searches it had already done."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has a guide on [carry-over](https://marisstella.app/league-schedule-generator/how-to-balance-carry-over-in-a-round-robin.html).
Carry-over is the hidden unfairness in a round robin: if many teams play the
Lions just before the Hawks, the Lions' style of play is passed on to the Hawks'
opponents. The guide's table compares 20 published top-flight football seasons
with what the tool's search produces for 18 and 20 teams. A test rebuilds that
table from the code every run, so the page can't drift from it.

That test took 18 seconds, the slowest in its file.

## Where the time went

Timing each search alone accounted for 16 of the 18 seconds: four searches per
league size, a single round robin and a home-and-away season, each scored on
carry-over alone and then with home/away breaks weighed in.

Then I counted calls by their arguments. At 18 and 20 teams the search doesn't
trust one starting point. It searches from the textbook circle method and from
each of its stored starter timetables, then keeps the best. The single round
robin does this. So does the home-and-away search, which needs a first leg and
gets one the same way, with the same seed, the same effort and the same break
weight. Every one of those starting searches ran exactly twice, for about
5 seconds of identical work.

## The fix, and what it doesn't touch

The search now has an opt-in memo, `withSearchMemo`. Inside it, a repeated call
with the same arguments gets a copy of the first answer. The search is seeded
and keeps no state between calls, so the answer is the same. Only the table
script turns it on. The table it prints is byte-for-byte what it was, and the
script went from 16.2 to 11.9 seconds. The test went from 18.0 to 13.6.

Why not memoise everywhere? Several tests call the search twice on purpose, to
show that the same seed gives the same season. A memo always on would make
those tests pass without checking anything. An opt-in memo saves the time and
leaves those checks real. A new half-second test checks the memo against the
unmemoised search, including that a caller editing its copy can't corrupt it.

The full reading, and what is left for the next run, is in
`docs/history/ci-perf-2026-11-16-carryover-guide-leg-memo.md`.
