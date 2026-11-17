---
title: "Stop counting once the dice say no: a faster annealer that gives the same answers"
seo_title: "Simulated annealing: reject moves early, same results"
date: 2026-11-17
description: "Our league scheduler priced every annealing move in full, then rejected most. Peeking the next random draw lets it stop early: 8% faster, same seasons."
topic: infrastructure
tags: [performance, algorithms, simulated-annealing, league-schedule-generator]
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
uses simulated annealing to find round robins with little carry-over, which is the
unfairness of always meeting a team right after the same opponent. Each step tries a
small change to the season, prices it, and keeps it or not. On a 9-team league that is
about 1.3 million priced moves per try (it anneals from more than one start), and the venture's test suite runs many tries.

## The waste

Annealing keeps a worse move with probability `exp((cur - v) / T)`. In code:

```js
const v = cost(season);
if (v <= cur || rand() < Math.exp((cur - v) / T)) cur = v; // keep
else undo();
```

Rearranged, a move is kept exactly when `v < cur - T·ln(u)`, where `u` is the random
number that `rand()` is about to return. Late in the search most moves are rejected,
and each one paid for a full count over every team's season to learn that.

If you know `u` before you price the move, you know the threshold, and you can stop
counting as soon as the move can't come in under it. The carry-over count is a sum
over teams, and every team still to be counted adds at least one per game step, so
"counted so far + the least the rest can add" is a valid lower bound to stop on.

## Same answers, not just similar ones

The catch is the random stream. The search is seeded so a share link rebuilds the
same season, so the stream must not change. The original only calls `rand()` when
`v > cur`. So we:

- added `peek()` to the seeded generator, which returns the next value without drawing it;
- stop early only when the partial count already exceeds the threshold plus 1, a
  rounding margin. That implies `v > cur`, so the original would also have drawn `u`
  and rejected the move. We draw it too, and reject it;
- price accepted moves in full, as before.

Every decision is the same, so every season is the same. We checked that, not
assumed it: one SHA-256 over 214 searches (3 to 16 teams, cyclic, weighted, capped,
home-and-away) matched before and after. A new test pins four of them. Breaking the
bound or the margin on purpose turns that test red.

## What it bought

In one 9-team search, 72% of the moves stopped early, on average after 5.4 of 9 teams.

| | before | after |
|---|---|---|
| the slowest test file, alone (two alternated runs) | 119.9 s, 113.1 s | 110.0 s, 103.4 s |
| nine weighted searches, 9 to 14 teams | 28.7 s mean | 26.8 s mean |
| six break-capped searches | 6.5 s mean | 5.8 s mean |

About 8% on the search-heavy tests, and the same for anyone generating a schedule on
the page. The capped search had a second, free win: a move over the break cap was
rejected without a draw, yet still had its carry-over counted. Now it isn't counted.

Two cleverer versions lost. Counting the moved teams first, so a bad move shows up
sooner, cost more in bookkeeping than it saved. Starting the count at one moved team
made no measurable difference. The whole-suite wall time, one run each, moved by less
than its own run-to-run spread, so we report the alternated per-file numbers instead.

Details and the ranked next steps: `docs/history/ci-perf-2026-11-17-league-priced-early.md`.
