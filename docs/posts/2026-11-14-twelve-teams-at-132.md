---
title: "Twelve teams at 132: the same move, a hundred times faster"
seo_title: "Round-robin carry-over at 12 teams: a 132 timetable from a C search"
date: 2026-11-14
tags: [league-schedule-generator, ventures, algorithms]
description: "A 12-team round robin with non-cyclic carry-over 132, found by rewriting the round-refill search in C. The proved least is 124, so the gap is now 124 to 132."
---

Carry-over is about who you play straight after whom. If every team that meets Ana in one round then meets Ben in the next, the teams that come after Ana all face a Ben who has just played the same opponent. A fair schedule spreads those pairs out. The [League Schedule Generator](https://marisstella.app/league-schedule-generator/) measures it with the usual score: sum the squares of the carry-over counts. For 12 teams, all playing, the score can't go below 120.

Earlier today an exhaustive search [proved 12 teams can't get below 124](2026-11-14-twelve-teams-cannot-reach-122.md). The best timetable anyone in this repository had found scored 136. So the true least was somewhere from 124 to 136.

## What changed

The 136 came from a JavaScript search with one move. Take a few rounds out of the timetable. Their games form a small regular graph. Put them back in the best order a depth-first search can find. The search cuts a branch as soon as its carry-over passes the current best.

That move is fine. It was just slow. Rewritten in C ([`eval/carryover-lns.c`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator/eval/carryover-lns.c)), with a node limit per refill and an occasional step uphill, it makes about 15,000 moves a second at 12 teams.

## What it found

- At 10 teams, where 94 is proved to be the least, it reaches 94 from a plain circle schedule in under a tenth of a second.
- At 12 teams, four 2-minute runs stopped at 136 to 140. Of four 15-minute runs, three found **132**, after 107, 369 and 575 seconds. The fourth stopped at 140. In the 132 timetable, six carry-over counts are 2 and the rest are 0 or 1.
- Another 10 minutes starting from the 132 found nothing lower.

So the least at 12 teams is now pinned between 124 and 132.

## What it didn't do

At 14, 18 and 24 teams, ten minutes from the built-in starter timetables changed nothing: 212, 318 and 570 stayed where they were. With more teams, each window of rounds splits in many more ways. These are kept as measurements, not hidden.

There was one surprise in the app itself. With the 132 as the only stored start, one setting got worse: the carry-over-only home-and-away season went from 530 to 538. A first half with less carry-over can still lead to a worse full season. So the old 136 stays as a second stored start, and the search keeps the best result from all its starts. Every setting is now the same or better. A 12-team single round robin goes from 136 to 132, and the break-weighted season from 602 to 576 carry-over at the same 40 breaks.

Everything is in the tool's [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator/README.md#12-teams-at-132-a-large-neighbourhood-search-in-c-2026-11-14-latest), with the raw runs in `eval/carryover-lns.txt`. I haven't compared any of this with published carry-over tables.
