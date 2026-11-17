# Venture suites: chant-forge's true-peak meter skips windows that cannot raise the peak (2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run took item 3 of "Where to look": the
slowest local step a session waits on, here the venture suites.

## Reading: every venture suite

`python3 platform/ci/run_venture_tests.py --slowest 40 --no-elsewhere`, this
container (4 cores), 2026-11-13 09:00 UTC: 1,346 suites, 0 failed. The top six
(changepoint-detector 572 s, shift-roster-builder 507 s, shed-designer 496 s,
league-schedule-generator 354 s, wall-framing-takeoff 156 s, ai-bookkeeper
133 s) all have earlier perf passes whose docs say the rest of their time is
spread out. Next was **chant-forge, 76.4 s**, with no perf pass before this one.

Per file (`node --test --test-reporter=dot <file>`, one at a time):
`render.test.mjs` 63.7 s, the next 1.4 s. In it, one test took 49.4 s: "--limit
reaches -14 LUFS on deep house with true peak under -1 dBTP" (the `--lufs` and
full-arrangement tests took 7.3 s and 7.6 s).

## Profile

A bench script (scratch, not committed) runs that test's render
(`renderMidi(..., { targetLufs: -14, limit: true, stems: true })`, 8,430,925
samples a channel) then `analyze`, and hashes the WAV, every stem and the
analysis JSON. Old code: render **45.0 s**, analyze 5.1 s, hash
`9387dcc95d6b352d`.

`node --cpu-prof`, self time: `truePeak` (master.mjs) **28.1 s**, `renderMidi`
13.1 s, `biquad` 3.0 s, `limiterCurve` 1.9 s.

Why: the limiter loop in `render.mjs` ran all 8 of its passes (it never meets
both the loudness and true-peak stopping tests on this piece), and each pass
measures the true peak of both channels. With `analyze` that is 18 calls, each
doing 3 phases x 32 taps per sample, with a bounds check on every tap.

## Change

`ventures/chant-forge/master.mjs`, `truePeak`:

1. Taps go in `Float64Array`s, and a sample whose 32-sample window lies inside
   the signal takes an unchecked loop. It adds the same products in the same
   order as the checked loop (kept for the 31 + 16 edge samples), so each
   interpolated value is the same double. Alone: render 45.0 to 30.9 s.
2. The result is the maximum of the sample peak and every interpolated value,
   so the scan starts from the sample peak. An interpolated value is at most
   `sum|taps|` times the largest `|sample|` in its window. Per-32-sample block
   maxima give that window maximum (a window spans two blocks), and a window
   whose bound, times `1 + 1e-9` for rounding in the sum, is below the peak so
   far is skipped: it cannot change the answer. NaN fails every comparison,
   so a NaN sample still reaches the result as before.

`master.test.mjs` gained a test that keeps the old function verbatim and
checks `Object.is(new, old)` on 189 cases: random, quiet with rare bursts,
alternating full-scale (inter-sample peaks above the sample peak), a sine with
its peak between samples, lengths 0 to 4,097 around the window edges, one NaN,
and factor/half of 4/16, 2/8 and 8/4. Halving the bound's margin makes it fail
(`n=31 factor=8 half=4`), so it does pin the skip.

## After

| measure | before | after | how |
|---|---:|---:|---|
| bench render + analyze | 45.0 s + 5.1 s | 15.0 s + 1.6 s | bench script, same hash `9387dcc95d6b352d` (two after runs: 14.97 s, 15.13 s) |
| `truePeak` self time | 28.1 s | 4.8 s | `node --cpu-prof` on the bench |
| `render.test.mjs` | 63.7 s | 23.4 s | `time node --test --test-reporter=dot render.test.mjs` |
| chant-forge suite alone | 64.9 s | 26.7 s | `run_venture_tests.py chant-forge`, old code via `git stash`, one after the other |

`master-cli.mjs` (the mastering check people run on their own WAV) calls the
same `truePeak` through `analyze`: on a 95 s stereo file that is 5.1 to 1.6 s.

## Not changed, ranked for the next run

1. **The limiter loop never converges on this piece**: all 8 passes run, so
   the render does 8 limiter curves, 8 loudness readings and 16 true-peak scans.
   Stopping earlier would change the output (the gain and ceiling of the last
   pass), so it is a product change with its own test, not a perf change.
2. `renderMidi` self time 3.4 s: `base[c].map((v) => v * g)` allocates two
   67 MB arrays a pass. Writing `x0`/`x1` into reused buffers is byte-identical
   and worth about 1 to 2 s.
3. `biquad` 2.9 s (K-weighting, 9 loudness readings). The two filters could run
   in one loop without the intermediate array; same order of operations, so the
   same doubles.
4. The top four suites are still most of the sweep; their docs say no single
   file dominates. P063 and P064 remain owner-gated.
