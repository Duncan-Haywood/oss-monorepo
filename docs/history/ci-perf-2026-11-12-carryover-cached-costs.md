# League scheduler: the carry-over search stops recounting what did not change (2026-11-12)

Perf track, prompt 0. Both open perf backlog items (P063, P064) are owner-gated
CI changes, so the run took item 1 of "Not changed" in
[`ci-perf-2026-11-12-divisions-anneal-tables.md`](ci-perf-2026-11-12-divisions-anneal-tables.md):
`best-of-k.test.mjs` and `capped-breaks.test.mjs` in
`ventures/league-schedule-generator`, the suite's longest files. The same search
runs in the page's Web Worker when an organiser asks for low carry-over, so a
faster search is also a shorter wait on the page.

## Reading (before)

`node --test <file>` per file, one at a time, this container (4 cores):

| file | wall |
|---|---|
| `capped-breaks.test.mjs` | 63.5 s |
| `best-of-k.test.mjs` | 55.6 s |
| `carryover.test.mjs` | 50.1 s |
| `starter.test.mjs` | 41.5 s |
| `fuzz-build.test.mjs` | 21.5 s |
| `calc.test.mjs` | 12.1 s |

Inside `capped-breaks`, three tests are 57 of the 63 s, all running
`bestCarryOverRounds(12 or 8, { double: true, ... })`; inside `best-of-k`, the
pool test is 36 of 56 s (16 searched tries and 6 serial runs at 8 teams).

## Profile

The six tries the capped-breaks tests run at 12 teams
(`carryOverTry(12, i, { double: true, seed: 1, effort: 0.3, weighted: 4 })`,
i = 0..5) as a script, `node --cpu-prof`, inclusive time: **11.9 s** total,
`anneal` 6.6 s (of it the leg-two cost `exact` 2.9 s), `assignVenuesDouble`
3.0 s, `assignVenues` 3.0 s. No one hot spot; three places recounted work
whose inputs had not changed:

1. **`assignVenuesDouble`** scored each flip as
   `teamCost(t) + teamCost(u)` after the flip minus the same before it. A
   team's cost reads only its own column and nothing else moved since the
   last accepted flip, so the "before" half was a recount of a known number.
2. **`assignVenuesOnce`**, run moves: the same, over every team the run touches
   (full `teamBreaks` per team, before and after).
3. **`lowCarryOverDoubleRounds`**, the two anneals that move leg two only
   (`breakWeight > 0` and the capped season): every move recounted the whole
   season's carry-over (`coeOf` over 2R rounds) and breaks (`hostBreaks`),
   although leg one never changes in those passes.

`coeOf` itself was already tight: a round-major rewrite with a touched-cell
reset benchmarked 6 to 20% slower than the stamped table, so it stayed.

## Change (`carryover.mjs`)

1. `assignVenuesDouble` keeps `tc[t]`, each team's current cost, updated on
   an accepted flip.
2. `assignVenuesOnce` keeps `tb[t]`, each team's current breaks; a single flip
   updates it from the `local` counts it already took, a run move from the
   recount after the flip.
3. `legTwoScorer(leg1, n, host)` counts leg one's carry-over cells, breaks and
   each team's last opponent and venue once; its `coe` and `breaks` then walk
   leg two only, starting each team where leg one left it. Same integers as
   `coeOf(o, n, false)` and `hostBreaks(o, n, R, host)`.

Every cost is an integer and every search is seeded, so a speed-up is only
real if the annealing takes the same path. `eval/search-hash.mjs` (new)
hashes 142 results: `carryOverTry` at 4 to 14 teams, single and double, four
weighted and two capped tries each, plus both venue searches (`legacy` on
and off), a capped and a weighted double, an uncapped double and a cyclic
single.

## After

- Hash: `f61d94fa030609cb8c3e75fa486180a7ff898ca5309c4c787136405fb9bb9f4a`
  before and after (142 results). The hash script itself: 42.2 s before,
  33.5 s after.
- The 12-team profile workload: 11.9 s before, 9.2 s after (`exact` 2.9 to
  1.9 s, `assignVenuesDouble` 3.0 to 1.9 s).
- Test files, same method as before (`node --test <file>`, one at a time):

  | file | before | after |
  |---|---|---|
  | `capped-breaks.test.mjs` | 63.5 s | 50.8 s (search only), 42.9 s (with the test memo below) |
  | `best-of-k.test.mjs` | 55.6 s | 47.0 s |

- `capped-breaks.test.mjs` also stopped searching the same six 12-team tries
  three times: tests 5 and 8 share one lazily searched set
  (`twelveTries()`), each combining its own `structuredClone`. Test 5 still
  runs `bestCarryOverRounds` itself and now also asserts the shared tries
  combine to its rounds; test 8 went from 12.2 s to under a second.
- Whole suite, `python3 platform/ci/run_venture_tests.py
  league-schedule-generator`: green, 85.4 s wall (no before number for the
  whole suite was taken; the per-file numbers above are the comparison).

## Not changed, ranked for the next run

1. `teamSwapRounds` (0.75 s of 9.2 s): `roundOf` scans the block for every
   lookup; a per-move position index would help, but the table changes with
   every accepted move.
2. The single search's `mixed` pass (`coeOf` + `greedyBreaks`, about 2 s of
   9.2 s) still recounts the whole leg per move. Every team's sequence changes
   on a round swap, so a delta needs locality around the two rounds (and
   bye-skipping links for odd leagues); worth it at 16 to 20 teams more than
   at 8.
3. `assignVenuesOnce` allocates a `touched` array per run move (part of its
   1.5 s self time).
4. `capped-breaks` test 6 (18 s) searches the 8-team tries three times over
   (`plain`, `more`, the pool, then two serial runs); `more` already holds
   `plain`'s four tries, so the same memo pattern applies.
5. `carryover.test.mjs` (50 s) and `starter.test.mjs` (41.5 s) are next in
   the file ranking and were not profiled this run.
6. P063 and P064 remain owner-gated.
