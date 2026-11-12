---
title: "The schedule search that recounted numbers it already knew"
seo_title: "Speeding up a simulated annealing search by caching unchanged costs"
date: 2026-11-12
tags: [league-schedule-generator, performance, algorithms, scheduling]
description: "The league scheduler's carry-over search recounted costs nothing had changed. Caching them made it faster, with every schedule hashing the same."
---

The [league schedule generator](../../ventures/league-schedule-generator/README.md)
can order a round robin so that no team keeps meeting opponents who have just
played the same strong side, a measure called carry-over. It searches for that
order with simulated annealing: make a small change, score it, keep it or undo
it, a few hundred thousand times. Then it searches again for home and away
games with few "breaks" (two home games in a row, or two away).

When an organiser asks for low carry-over, the page runs that search in a
background worker, several tries at once. The same search is also behind the
two slowest files in the scheduler's test suite, at about a minute each.

## What the profile showed

No single function stood out. What stood out was a pattern, in three places.
The search scored each move by counting the cost after it, minus the cost
before it, and it counted the "before" again from scratch each time:

- **Home and away for a full season.** A move swaps one pair's home and away
  games. Only those two teams' costs can change. The code recounted both
  teams before the swap, though nothing had touched them since the last
  accepted move.
- **Home and away for one leg.** The same, for a move that flips a whole run
  of games.
- **The second leg of a home-and-away season.** Two passes move only leg
  two, but every move recounted carry-over and breaks across the whole
  season, leg one included.

## The change

Keep the numbers instead of recounting them. Each team's current cost is
stored and updated when a move is kept. Leg one's carry-over counts and
breaks are taken once, along with where each team stands when leg one ends,
and each move then counts leg two alone.

## Same answers

Every cost here is a whole number and every search is seeded. So if any score
came out even slightly different, the search would take another path and
return another schedule. A new script, `eval/search-hash.mjs`, runs 142
searches across league sizes 4 to 14, single and double, weighted and capped,
and hashes every result. The hash was the same before and after.

The hash run fell from 42 s to 33.5 s. A profile of six 12-team season tries
fell from 11.9 s to 9.2 s. The two slowest test files fell from 63.5 s to 42.9 s
(that one also stopped searching the same tries twice) and from 55.6 s to
47 s.

## What's left

The next cost is the single-leg pass. It recounts the whole leg per move
because a round swap changes every team's sequence. A delta that only looks
around the two swapped rounds would pay off most at 16 to 20 teams. The
details, and a ranked list for the next run, are in
`docs/history/ci-perf-2026-11-12-carryover-cached-costs.md`.
