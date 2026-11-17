# Venture suites: chant-forge's limiter loop, fused K-weighting and reused pass buffers (2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run took items 2 and 3 of the "Not
changed" list in `ci-perf-2026-11-13-chant-forge-true-peak.md` (written this
morning): `renderMidi`'s per-pass 67 MB allocations and the two-loop
K-weighting.

## Reading

A bench script (scratch, not committed; the same set-up as this morning's)
renders the test "--limit reaches -14 LUFS on deep house ..." with
`renderMidi(..., { targetLufs: -14, limit: true, stems: true })`, then
`analyze(readWav(encodeWav(r)))`, and hashes the mix, every stem, `r.lufs` and
the analysis JSON. On `main` at `3f23c43ba` (after #15541 changed the
arrangement, so the hash differs from this morning's): render **15.5 s / 15.7 s**
(two runs), analyze 1.6 s, hash `530a7b97baa28bdd`.

`node --cpu-prof`, self time: `truePeak` 4.75 s, `renderMidi` 3.74 s, `biquad`
3.02 s, `limiterCurve` 2.14 s, the sum-of-squares closure in `integratedLufs`
1.11 s.

## Change

1. `master.mjs`: `kWeightedEnergy(x, fs)` runs the shelf, the high-pass and the
   running sum of squares in one loop, returning the cumulative array
   `integratedLufs` used. The high-pass's input history is the shelf's output
   history, so it needs no extra state. Each product and sum is the old one in
   the old order. `kWeight` is kept (exported) and shares the coefficients
   through `kCoeffs`.
2. `render.mjs`: the limiter loop writes `x0`/`x1` into two buffers allocated
   once instead of `base[c].map(...)` each pass.
3. `truePeak(x, factor, half, floor = 0)`: the peak starts at `floor`, so
   `truePeak(R, 4, 16, truePeak(L))` is `Math.max(truePeak(L), truePeak(R))`
   exactly and R's scan can skip windows that cannot beat L. Used in the limiter
   loop and in `analyze` (which keeps `-Infinity` for zero channels, as
   `Math.max()` gave).

`master.test.mjs` gained two tests: `kWeightedEnergy` against `kWeight` plus
the old sum loop, `Object.is` on every element (3 rates x 6 lengths, 0 to
20,000); and `truePeak` with eight floors (0, below, equal, above the peak,
NaN) against `Math.max(floor, truePeak(x))` on 16 signals. Swapping two terms
of the high-pass sum (`c1*y1 + c2*y2` to `c2*y2 + c1*y1`) makes the first fail.

## After

| measure | before | after | how |
|---|---:|---:|---|
| bench render | 15.5 s, 15.7 s | 11.5 s, 12.4 s | bench script, same hash `530a7b97baa28bdd` |
| bench analyze | 1.6 s | 1.3 to 1.5 s | same |
| `biquad` + sum loop self time | 4.1 s | 1.9 s (`kWeightedEnergy`) | `node --cpu-prof` on the bench |
| `renderMidi` self time | 3.74 s | 1.99 s | same |
| chant-forge suite | 26.3 s | 20.9 s | `time python3 platform/ci/run_venture_tests.py chant-forge`, old code via `git stash`, one after the other, 4 cores |

## Not changed, ranked for the next run

1. **`truePeak` is still 4.8 to 5.3 s** and the floor barely helped: after the
   limiter, most 32-sample blocks sit near the ceiling, and the skip bound
   (sum |taps|, about 1.6, times the block maximum) only skips blocks below
   about 0.55 of the peak. On limited audio the meter does nearly the full
   3 x 32 multiply-adds a sample. A tighter exact bound would need per-phase,
   per-window work close to the sum itself. Not worth it without a new idea.
2. **`limiterCurve` 2.1 s** (8 passes): four full-length arrays a pass
   (`need`, `mn`, `dq`, `out`, plus `cs`). Reusing them across passes, as done
   here for `x0`/`x1`, is exact and worth perhaps 0.5 s.
3. The limiter loop still runs all 8 passes on this piece (this morning's item 1):
   a product decision, not perf.
4. P063 and P064 remain owner-gated.
