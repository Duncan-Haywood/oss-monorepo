# Perf, 2026-11-18: tournament-pairing-manager sorts each player's candidates once

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (owner-gated). This run ranked `platform/ci/venture_suite_times.json`
against the number of `docs/history/*perf*.md` files naming each slug and timed
the slowest suites with no perf pass on record (`suite_file_times.py`):
tournament-pairing-manager `calc.test.mjs` 4.5 s, conformal-prediction-intervals
`engine.test.mjs` 3.4 s, event-seating-chart-optimizer `calc.test.mjs` 2.9 s,
demand-charge-interval-analyzer `tou.test.mjs` 2.5 s. Took the first.

## Reading

- `node --test --test-reporter=spec calc.test.mjs`: the 32-player Swiss event
  test 3.2 s, the 31-player one 1.15 s, everything else under 0.1 s.
- `node --cpu-prof` on a scratch benchmark (19 field sizes from 4 to 64, three
  seeds, colours on and off, every round; not committed): 140 s total. Self
  time: `go` (the branch-and-bound node) 86.6 s, `pairCost` 22.9 s,
  `colourPref` 14.1 s, `groupSize` 12.3 s, GC 7.1 s.
- Why: `bestMatching` searches "pair the first free player with someone" up to
  a 400,000-node budget, once per bye candidate (up to 8). At every node it
  rebuilt the list of free partners, called `pairCost` for each (which calls
  `orient`, which re-filters both players' colour histories), and sorted the
  list.

## Change (`ventures/tournament-pairing-manager/calc.mjs`)

`pairCost(ids[i], ids[j], groupHalf)` depends only on `i` and `j` inside one
`bestMatching` call, so the call now fills an `n x n` cost table once and
sorts each row's partners once by `(cost, j)`, the same comparator as before.
A node walks its row and skips used partners. Filtering a presorted list keeps
its order, so the search visits the same nodes in the same order, spends the
budget identically (the `budget--` expression is untouched) and returns the
same matching.

## Verification

- Scratch benchmark digest (sha256 of every `pairSwissRound` result, 114
  events): `4098a306…5731eeb` before and after.
- New test `Swiss pairings match the pinned digest of eight seeded events`
  (9, 15, 24 and 31 players, colours on and off, every round's pairings, byes
  and notes) pins the digest the old code produced, `d66e65df…ecf5b8df`. It
  passes against the old `calc.mjs` (12.6 s) and the new one.
- All 66 tests pass; the other three test files are untouched.

## Numbers

| measure | before | after |
|---|---:|---:|
| `node --test calc.test.mjs`, idle container, 3 runs | 4.5 s (65 tests) | 1.35 / 1.35 / 1.37 s (66 tests) |
| scratch benchmark, 114 events | 140.3 s | 17.5 s |
| worst single round, 63 players (what the page waits on) | 6.7 s | 0.28 s |
| worst single round, 31 players | 2.0 s | 0.15 s |

The page runs `pairSwissRound` on the main thread when a director clicks
"pair next round", so the last two rows are the user-facing win.

## Not changed, ranked for the next run

1. **The remaining `go` self time.** The search is still budget-bound on odd
   fields with many tied scores. A lower bound (sum of each free player's
   cheapest remaining partner, halved) would prune more, but it changes which
   nodes the budget reaches and so can change the matching when the budget
   runs out; it needs a pinned-quality comparison, not a digest.
2. **Bye candidates** re-run the full search up to 8 times; the cost table for
   the remaining players could be shared across them (a sub-table of one
   `n x n` table) for a small further cut.
3. Other untouched suites timed this run: conformal-prediction-intervals
   `engine.test.mjs` 3.4 s, event-seating-chart-optimizer `calc.test.mjs`
   2.9 s, demand-charge-interval-analyzer `tou.test.mjs` 2.5 s; none profiled.
