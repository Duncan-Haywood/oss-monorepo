# matrix-profile-explorer: a correlation screen halves the exact matrix profile, same bits (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. No `docs/history/*perf*.md` named
matrix-profile-explorer. Its test suite is small (1.8 s, `suite_file_times.py
matrix-profile-explorer --jobs 1`), so this pass went to what a visitor waits
for: the in-browser STOMP run, which is O(n^2) and allowed up to 200,000 points.

## Reading

Scratch benches, Node 22, 4-core 2.1 GHz Xeon (the cloud runner), seeded
random-walk-plus-sine series, `matrixProfile(values, m)` alone:

| case | before | after |
|---|---:|---:|
| 20,000 points, m = 100 (three runs) | 1,956 / 2,078 / 2,069 ms | 911 / 1,119 / 948 ms |
| 20,000 points, m = 50 | 2,076 ms | 942 ms |
| 20,000 points, m = 200 | 1,972 ms | 947 ms |
| 50,000 points, m = 50 | 12,546 ms | 6,632 ms |
| 50,000 points, m = 200 | 13,311 ms | 6,716 ms |
| `analyze({})` on the bundled NOAA CO2 example | 25.9 ms | 14.5 ms |

The work is the double loop over window pairs: about 10 ns per pair before.
Each pair did a division, a clamp, a `Math.sqrt` and two compare-and-store
steps. No profiler was needed to place the time: everything outside the pair
loop is O(n m) and under 5 ms at these sizes.

## Change (`ventures/matrix-profile-explorer/engine.mjs`, `matrixProfile`)

- **Correlation screen.** `d = sqrt(2m(1 - r))` is a monotone non-increasing
  function of `r` under IEEE rounding (each of `1 - r`, `2m * t` and `sqrt`
  is correctly rounded, hence monotone). So `r <= R[x]`, where `R[x]` is the
  correlation behind the stored `P[x]`, implies `d >= P[x]` and the old
  `d < P[x]` update cannot fire. The square root is taken only for a pair whose
  correlation beats the stored one, and the update itself is still the exact
  old `d < P[x]` test, so ties (including rounding ties, where two different
  `r` give one `d`) resolve as before. Most pairs now stop at one comparison.
- **Flat windows as correlations.** Both flat maps to `r = 1` (`d = 0`), one
  flat to `r = 0.5`, and `sqrt(2m * 0.5)` is exactly `Math.sqrt(m)`.
- **Hoisted products.** `m * mu[i]` and `m * sig[i]` are the left-to-right
  products the old `m * mi * mu[j]` and `m * si * sig[j]` computed first, so
  `r` is bit-identical. Row `i`'s own best is kept in locals and stored once.

Not done, because it changes bits: replacing the division by a precomputed
reciprocal of `sig[j]`.

## Verification

- New `stomp-pinned.test.mjs`: the earlier `matrixProfile` copied verbatim;
  40 seeded series of five kinds (random walk, small integers with many exact
  ties, flat runs, a pure period, spikes on a sine), n 20 to 320. Profile
  compared with `Object.is` per entry, index and flat flags deep-equal.
- Mutation check of the new test: `d <= bestD`, `d <= P[j]`, dropping the
  distance test behind the screen, and mapping one-flat to `r = 0.4` each fail it.
- The benches above print the same index hash and profile entries before and
  after; `analyze({})` JSON is string-identical.
- Full suite: `python3 platform/ci/suite_file_times.py matrix-profile-explorer --jobs 1`,
  5 files, 38 tests, all ok, 2.0 s.

## Not changed, ranked for the next run

1. **Fusing the QT row update into the comparison loop** (two row buffers so
   both run left to right): tried, no gain (1,100 vs 1,125 ms at 20,000).
   The pair loop is bound by the division and the column loads, not the
   extra pass.
2. **Reciprocal sigma** to drop the division: probably another 1.3x or so,
   but `r` changes in the last bit, so motif and discord ties could move. Only
   with a tolerance-based pin and a stated reason.
3. **Running the worker's rows in parallel** (several workers, diagonal
   blocks): the real lever above 50,000 points; needs a merge of per-block
   profiles in a fixed order to keep ties identical.
