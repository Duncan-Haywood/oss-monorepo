# Perf, 2026-11-18: youth-lineup-rotator's cost function stops allocating

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (owner-gated). This run timed four mid-tier suites from
`platform/ci/venture_suite_times.json` with one or no earlier perf pass
(youth-lineup-rotator, garmin-world-traveler-watchface,
s3-storage-class-savings, support-agent) using
`platform/ci/suite_file_times.py`, and took the slowest file:
youth-lineup-rotator `calc.test.mjs`, 5.8 s alone.

## Reading

- `node --test calc.test.mjs`, idle 4-core container, three runs:
  **5.53 / 5.71 / 5.55 s**.
- `node --cpu-prof` of a 24-lineup benchmark (all 8 presets x 3 seeds, scratch
  script, not committed): `lineupCost` **4.49 s self of ~5.7 s**, its two
  `Array.from` callbacks another 1.0 s, GC 0.17 s.
- Why: `anneal` scores the whole grid after every proposed move, 25,000
  iterations x 5 restarts = 125,000 calls per lineup, and each call allocated
  `periods + N + 3` fresh arrays (the per-period on-field rows and the
  per-player position counts).

## Change (`ventures/youth-lineup-rotator/calc.mjs`)

`lineupCost` keeps typed scratch arrays (`Int32Array`/`Uint8Array`/
`Float64Array`, flat `t * N + p` and `p * K + n` indexing) on the context,
created on first use and re-created if the dimensions differ, and refills
them per call. Every term is added in the same order as before, so the float
total is bit-identical; the dead per-period reset of `last` (it is read only
when the player was on the field the period before, which rewrote it) was
dropped. No incremental/delta cost: that would reorder float additions and
could flip annealer accept decisions.

## Verification

- Benchmark output (sha256 of cost + grid for the 24 lineups):
  `fa22df95…b6ea7b` before and after.
- New test `lineupCost matches the plain cost function exactly on random grids`
  keeps the old allocating version as a reference and compares 2,400 random
  grids (with empty slots, fractional skill and `sat`, keeper caps,
  `balance` 0/1/2, contexts of different sizes reused) plus annealed grids,
  with `assert.equal` (exact). Mutants `15 -> 16`, `onField[p]`,
  `count[ns]`, and dropping `played.fill(0)` all fail it; `t > 0` removal and
  a reversed strength sum survive and are equivalent (shown above).
- Whole suite: 30/30 pass (calc 17, page + usage 13).

## After

- `node --test calc.test.mjs`, same container, three runs:
  **2.24 / 2.11 / 2.01 s** (5.6 s -> 2.1 s, about 2.6x).
- Benchmark: 5.7-6.1 s -> 1.8-2.2 s.
- What a coach waits on: one `buildLineup` of the page's example roster
  (median of 7 seeds) **179 ms -> 82 ms**.

## Not changed, ranked for the next run

1. **The remaining `lineupCost` time** is the full-grid rescore itself. A
   delta cost (only the touched period and the two players moved) would cut
   it by ~N/2 but reorders float additions; it needs a decision that
   near-tie differences in the chosen lineup are acceptable, or integer-only
   costs (scale `sat` by 2 and the balance term by a fixed denominator).
2. **`exhaustive search` test** (0.18 s) and the page test (2.1 s, mostly
   reading the HTML) are not worth a pass.
3. Other untouched mid-tier suites timed this run: support-agent
   `eval.test.mjs` 5.8 s, garmin-world-traveler-watchface `citydata.test.mjs`
   4.6 s, s3-storage-class-savings `engine.test.mjs` 4.3 s; none profiled yet.
