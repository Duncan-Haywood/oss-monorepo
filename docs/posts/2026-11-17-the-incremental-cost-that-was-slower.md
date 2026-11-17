---
title: "The incremental cost function that made our scheduler twice as slow"
seo_title: "Simulated annealing: when incremental cost evaluation is slower"
date: 2026-11-17
tags: [performance, scheduling, simulated-annealing, round-robin]
description: "Recounting a 12-team league's carry-over value in full on every annealing move beat updating it incrementally; the win was in the venue search instead."
---

Our [league schedule generator](/league-schedule-generator/) searches for a
round robin where no team keeps meeting opponents who have just played the same
side: the *carry-over effect*. It does this with simulated annealing. It swaps
rounds or parts of rounds, rescores the season and keeps or undoes the move.

The textbook speed-up for annealing is incremental evaluation. A move changes
two rounds, so update the score for those rounds rather than recounting the
whole season. We wrote it and checked that it gave byte-identical schedules
over 367 seeded searches. Then we timed it: a 12-team search went from 1.3 s
to 3.3 s. A leaner second version still took 2.2 s.

The reason is size. At 12 teams the full recount is about 130 cells of integer
arithmetic in one tight loop over a scratch table. The incremental version has
to take each affected step out of the counts before the move and put the new
one in after it. When the move is rejected, which happens to most moves, it does
that a second time. A round swap affects every team, so the "small" update is
about 144 operations against the recount's 132, and each of those operations
costs more. Incremental evaluation pays when the state is large and a move is
small. A 12-team season is not large.

The real saving was elsewhere. After the rounds are fixed, a second search
picks home and away for each game to avoid two home or two away games in a row
(a "break"). One of its moves flips a team's whole alternating stretch, and it
was priced by recounting every touched team's breaks across the whole season.
Breaks only change next to the flipped rounds, so pricing just those pairs gives
the same number. The venue search is now about 30% faster at 30 teams and the
whole 30-team search about 9% faster. A seeded hash over 142 searches is
unchanged, so every schedule the site gives is the same as before.

The notes, numbers and the two leads we dropped are in
[the perf history](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-17-league-venue-run-local.md).
