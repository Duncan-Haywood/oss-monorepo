# CI perf, 2026-11-12: carry-over search, 17% less CPU, same schedules

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner. This run took item 1
of "Not changed" in
[`ci-perf-2026-11-12-divisions-anneal-tables.md`](ci-perf-2026-11-12-divisions-anneal-tables.md):
`best-of-k.test.mjs` and `capped-breaks.test.mjs`, now the league scheduler's
longest test files. No open PR touches `carryover.mjs`.

## Reading (before)

- `best-of-k.test.mjs` 59.3 s, `capped-breaks.test.mjs` 67.2 s
  (`time node --test --test-reporter=dot <file>`, this container).
- The longest tests: "a pool of any size ... returns exactly the serial search"
  (39.8 s), "capped tries reach the few-breaks end" (26.7 s), "weighted tries are
  unchanged by capped ones" (23.9 s). All are 8- and 12-team best-of-k searches
  (`carryOverTry`), single and home-and-away.
- A workload script (scratch, not committed) runs those searches: 16 tries at 8
  teams (single and double), 6 double tries with capped ones at 8 and 12 teams,
  `lowCarryOverCappedRounds` at 5 to 14 teams and 6 double tries at 5, 7, 9 and
  11 teams, and hashes `JSON.stringify` of every result. **53.9 s**, hash
  `2eb5936daff0a1c8`.

`node --cpu-prof`, self time per function (inlined callees count in the caller):

| function | self |
|---|---|
| `coeOf` | 8.1 s |
| `assignVenuesOnce` | 6.5 s |
| `exact` (inlined `hostBreaks`) | 6.1 s |
| `mixed` (inlined `greedyBreaks`) | 5.9 s |
| `teamSwapRounds` | 4.7 s |
| `anneal` | 4.2 s |
| `coeCost` | 3.4 s |
| `within` (inlined `hostBreaks`) | 1.3 s |

## Change (`ventures/league-schedule-generator/carryover.mjs`)

1. **`hostBreaks` became `legTwoHostBreaks`.** Its three callers (the double
   search's capped and break-weighted passes) anneal leg two only, so leg one's
   rows never change. The new function counts each team's leg-one breaks and
   last venue once, reads hosts from an `N * N` table built once (no
   `Math.min`/`Math.max` per game) and walks leg two alone per call.
2. **`teamSwapRounds` uses stamped scratch marks** (as `coeOf` already does)
   instead of allocating three typed arrays per call, and inlines its
   `roundOf` closure. The scan order and the early `break`s are unchanged.

## Verification

- **Same answers.** Workload hash `2eb5936daff0a1c8` before, after change 1 and
  after change 2.
- Workload wall time: 53.9 s, 48.9 s after change 1, **44.8 s** after change 2
  (-17%).
- `best-of-k.test.mjs` 59.3 s to **56.2 s**; `capped-breaks.test.mjs` 67.2 s to
  **61.6 s**, all passing.
- Full venture suite (`python3 platform/ci/run_venture_tests.py
  league-schedule-generator`): see the run record's `notes`.

The test files gain less than the workload because their single-leg 8-team
tries spend most of their time in `mixed` (carry-over plus the greedy breaks
pass), which this run did not touch. The same search runs in the browser worker
behind the page's "best of k" button, so the CPU saved there is a visitor's too.

## Not changed, ranked for the next run

1. **An incremental carry-over delta inside `anneal`.** Carry-over is an integer
   (a sum of squared counts), so a delta over the rows a move touches would be
   exact, unlike the float costs in `divisions.mjs`. It needs the cost closures
   split into a carry-over part and a breaks part; `greedyBreaks` and
   `legTwoHostBreaks` would stay full recounts. Biggest lever left (`coeOf` plus
   `coeCost` plus most of `mixed` is about 15 s of the 45).
2. `assignVenuesOnce`: the run move allocates `touched` each time and the best
   venues are copied on every improvement; worth a look after 1.
3. The pool test computes `bestCarryOverRounds` three times per mode (one per
   pick) with identical tries; that is the serial path under test, so it was
   left as it is.
4. P063 and P064 remain owner-gated.
