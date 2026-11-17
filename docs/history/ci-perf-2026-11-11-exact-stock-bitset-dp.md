# CI perf, 2026-11-11: wall-framing-takeoff's exact lumber DP, suite 85 s to 36 s

Perf track. Both open backlog perf items (P063, P064) touch
`.github/workflows/`, which CODEOWNERS holds for the owner, so this run took
"the slowest local step an agent session waits on". changepoint-detector had
two passes today already; wall-framing-takeoff has the second-largest test code
in `ventures/` (919 KB, 141 files, 1,177 tests) and 296 file changes since
2026-11-04.

## Reading

`node --test '*.test.mjs'` from the venture directory, this 4-core container:
88 s wall. The three slowest tests (29.3 s, 24.0 s, 12.7 s) were all
seeded-random sheathing sweeps. Timing the 300-wall sweep's two calls apart:
`takeoff` 22.2 s, `sheathe` 1.3 s. Under `node --cpu-prof`, 24.9 s of 25.7 s
of self time was in one function: `exactStock` (`engine.mjs`).

`exactStock` is the exact cheapest-lumber cover, a DP over the vector of
pieces still to cut. Instrumented, the sweep made 355 calls; the slow ones had
9 or 10 piece lengths, 60,000 to 162,000 states and 150 to 270 cutting
patterns, about 0.4 to 0.56 s each. For every state it decoded the mixed-radix
index with `n` divisions, then tested every pattern digit by digit
(`pats[j].counts[i] > d[i]`) to find the ones that fit.

## Change (`ventures/wall-framing-takeoff/engine.mjs`, `exactStock` only)

- `fit[i][v]`: a bitset of the patterns that use at most `v` of piece `i`. A
  state's fitting patterns are the AND of its digits' bitsets.
- Digits advance like an odometer instead of being decoded, and a suffix AND
  `suf[i] = fit[i][d[i]] & suf[i + 1]` is recomputed only for the digits that
  changed (usually just digit 0: one AND of `ceil(patterns / 32)` words).
- Fitting patterns are visited lowest bit first, which is ascending `j`, the
  same order the old loop used, with the same `v < best - 1e-12` test, so ties
  resolve to the same pattern and `how[]` is unchanged. Prices and steps moved
  into typed arrays.

Pattern enumeration, the work limit, the `null` return and the bar
reconstruction are untouched.

## Verification

- Same answers, the DP alone: old and new `engine.mjs` imported side by side,
  `JSON.stringify(exactStock(...))` compared on 4,000 random instances (1 to
  10 piece lengths, demand 1 to 12, 1 to 4 boards with integer or decimal
  prices, 20% with a duplicated board to force ties, 10% at work limit 1e8):
  2,816 solved, 1,184 refused as too big by both, 65 with over 50,000 states,
  0 differences.
- Same answers, end to end: the 300-wall sweep's `sheathe` results written
  out under both engines, byte-identical (`cmp`).
- The suite: 1,177 of 1,177 pass. (The "before" copy, run from outside
  `ventures/`, fails one sibling-link test that reads
  `../cut-list-optimizer/index.html`; it passes in place.)

## Numbers

Same container, nothing else running, bash `time node --test '*.test.mjs'`,
"before" from a copy of the venture with the old `engine.mjs`.

| | before | after |
|---|---|---|
| suite wall | 84.7 s | 36.2 s (−57%) |
| suite user CPU | 201 s | 110 s (−45%) |
| two-course sheathing, 300 seeded walls | 29.4 s | 2.2 s |
| horizontal sheathing, 200 seeded walls | 24.1 s | 2.5 s |
| 400 seeded random walls | 11.7 s | 1.2 s |
| fuzz: sheathing panels tile every wall | 14.3 s | 7.7 s |
| `takeoff(samplePlan())`, mean of 5 warm | 26.9 ms | 17.0 ms |

## Not changed, ranked for the next run

1. **league-schedule-generator**: 221 s wall for 426 tests in this container
   (measured during this run's survey, with other work running alongside, so
   an upper bound). The slowest venture suite not yet profiled.
2. wall-framing-takeoff's "mutation sweep" (17.0 s) is now its critical path;
   not profiled.
3. P063 and P064 remain owner-gated.
