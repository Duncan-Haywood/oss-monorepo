# Perf, 2026-11-12: quick-pick-survey information selector, per-item terms

Perf track. Shipped: `selectNextPairByInformation` (`ventures/quick-pick-survey/src/lib/pairing.ts`)
computes per-item terms once instead of once per pair. Same pairs, same floats,
same `rand()` draws. The simulation suite goes from 630 s to 151 s, and the
live route's selector from 33 ms to 13 ms at 500 items.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 15` (289 jobs, 236 job-minutes,
a 26-minute window): after Portfolio Pages, Portfolio validate and ventures tests,
`quick-pick-survey CI` was next at 11.6 job-minutes from 2 jobs. Its median job ran
348 s, and the heaviest step was `Simulation tests` (7.8 min). The 2026-11-08 reading
(`ci-perf-2026-11-08-qps-simulation-floor-reading.md`) found the wall time is the
slowest file, `poolCapDeep4000`. It suggested running that file's six simulations in parallel.
This run profiled the simulation instead.

## Profile

`node --import tsx --cpu-prof` on `cell(500, 800, 1)` (the poolCap cell at a
smaller budget; 9.1 s). Self time:

| s | function |
|---:|---|
| 2.47 | `pairKey` (array, sort, join per pair) |
| 1.87 | `selectNextPairByInformation` loop |
| 1.77 | string sort internals (`TextDecoder set` in the profile) |
| 1.43 | `__name` (tsx keep-names wrapper on the per-pair `drop`/`lag` closures) |
| 0.64 | `expectedVarianceReduction` |

So almost all of it was building a key string for each of the 125k pairs per step
(to look it up in a set of at most 10 recent keys), plus closures and repeated
`glickoG(phi)` calls that depend on one item only.

## Change

- A pair's key is built only when both ids occur as substrings of some recent key.
  Every key in the set contains both its ids, so that is a necessary condition and the
  lookup result cannot change.
- `phi`, `phi²`, `1/phi²`, `glickoG(phi)²`, the lag, the rating and the first
  dimension are computed once per item. The per-pair `p`/`spread` are unchanged, and
  each term uses the same operations in the same order, so every score is the same float.
- `rand()` is still drawn once per pair, in the same order, and `best` keeps its
  `null` semantics.

## Verification

- `src/lib/pairingInformationParity.test.ts`: the old per-pair loop is kept verbatim
  as a reference. It is compared on 25 seeds x 4 option sets x 5 pool sizes (2 to 130 items,
  coarse ratings so the tie-breaker decides, recent keys, over-cap pools). Each case runs
  twice, the second time with the winner marked recent. The test checks the same pair and
  the same next `rand()` value, so the draw count matches. A fixed case also pins the penalty
  between 0.0493 and 0.0512. Ten mutations that change behaviour, all caught: penalty 0.5,
  0.1, 0.06, 0.04 and 0.03, the `gSq` index swapped, the tie-break noise scale changed,
  the wrong key format, the conflict bonus ignored, and coverage dropped. One mutation
  passes, and should: dropping the `inRecent[j]` pre-check changes speed only.
- Full simulation suite (`npx vitest run --config vitest.simulations.config.ts
  --reporter=json`, 4-core container, `MEASURE_OUT` set): the 14 MEASURE lines are
  **byte-identical** before and after, and 41/41 tests pass both times.
  `pooling.simulation.test.ts` needs the generated Prisma client, so I ran it on its own
  after `npx prisma generate`: 13/13 pass on both versions.
- `npm run verify` (typecheck, lint, test, build): exit 0, 58 files and 470/470 tests, build compiled.

## Numbers

Simulation suite, same container, run back to back (wall time per file from the JSON report):

| file | before s | after s |
|---|---:|---:|
| poolCapDeep4000 | 555 | 150 |
| pairMix | 238 | 70 |
| poolCapDeep2000 | 129 | 38 |
| poolCap | 30 | 17 |
| biasedRespondent | 26 | 17 |
| **suite wall** | **630** | **151** |

Live selector, `PAIR_BENCH=… npx vitest run src/lib/pairLatency.test.ts` (median of 15
calls, ms):

| items | answered | information before | after | staged before | after |
|---:|---:|---:|---:|---:|---:|
| 220 | 300 | 10.4 | 4.1 | 9.7 | 4.0 |
| 500 | 300 | 32.9 | 12.8 | 49.5 | 10.0 |
| 500 | 1000 | 32.8 | 12.8 | 32.2 | 10.9 |

The container ran slower than the 2026-11-08 one (poolCapDeep4000 took 555 s here
against 406 s there), so read the ratio (3.7x on that file, 4.2x on the suite) rather
than the seconds. On CI (GitHub-hosted, from the step timestamps of `quick-pick-survey CI` runs): the
`Simulation tests` step took 337 to 610 s, median about 442 s, over the previous 11
successful runs on 2026-11-12. One outlier ran 151 s. On this PR (#15076) it took
**194 s**. That is about 2.3x on CI against 4.2x in the container, so a few more runs
are needed before the CI figure settles.

## Not changed (ranked)

1. `poolCapDeep4000` is still the floor (150 s, against 70 s for the next file). The
   2026-11-08 idea of running `cell()`'s six simulations on worker threads still applies.
   It would bring that file to about 50 s and the suite to about pairMix's 70 s.
2. The pair loop still evaluates `exp`, `hypot` and one `glickoG` per pair. Those depend on
   both items. A faster form would change the floats, so it would need a tolerance argument, not `cmp`.
3. `simulate()` copies all items into `live` on every answer (O(n) per step). That is small
   next to the O(n²) loop.
