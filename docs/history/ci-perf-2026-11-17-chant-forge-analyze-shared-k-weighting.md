# Venture suites: chant-forge's `analyze` runs the K-weighting filter once per channel, not four times (2026-11-17)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change
workflow files and wait for the owner. The pool reading this run
(`ci_profile.py --runs 600 --top 25`, 19:12 to 19:53 UTC) had
`node --test in each touched venture` at 57.4 of 594.6 job-minutes, so this
run took item 3 of "Where to look": a slow venture test file.

## Reading

`python3 platform/ci/suite_file_times.py <slug>` for three suites with few
earlier passes, this container (4 cores):

| suite | summed s | slowest file |
|---|---:|---|
| ai-bookkeeper | 66.7 | 2.1 s (339 files; flat, start-up bound) |
| chant-forge | 105.6 | `ep-queue.test.mjs` 18.0 s, `sing.test.mjs` 14.7 s |
| open-house-plans | 25.5 | `engine.test.mjs` 17.0 s (had a pass 2026-11-13) |

`ep-queue.test.mjs` is newer than chant-forge's last perf note (2026-11-14,
which named `render-limit.test.mjs` the floor), so it had not been read.

## Profile

`node --cpu-prof ep-queue.test.mjs`, self time summed per function, 19.0 s:
`kWeightedEnergy` **5.6 s**, `truePeak` 3.1 s, `renderMidi` 1.9 s,
`coverPixels` 1.8 s, zlib 1.5 s, `analyze` 1.0 s, `limiterCurve` 0.9 s.

Split by caller (`kWeightedEnergy` nodes grouped by their parent chain):
`maxWindowLoudness < analyze` 2.0 s, `integratedLufs < renderMidi` 1.7 s,
`integratedLufs < analyze` 1.0 s, `loudnessRange < analyze` 1.0 s. So
`analyze` ran the same two-biquad filter over the same channel four times
(integrated loudness, momentary max, short-term max, loudness range) and
threw the running sums away each time: 4.0 s, of which 3.0 s was repeat work.

## Change

`ventures/chant-forge/master.mjs`: `analyze` computes
`channels.map((c) => kWeightedEnergy(c, rate))` once and passes it to
`integratedLufs`, `maxWindowLoudness` (twice) and `loudnessRange`, each of
which takes it as a new optional argument and otherwise computes its own as
before. `loudnessRange` uses the shared sums only when there is no tail pad
(a padded signal is a different array with its own sums). The limiter loop in
`render.mjs` is untouched: it changes the signal between its
`integratedLufs` calls, so nothing there may be reused, and no cache is keyed
on array identity for the same reason.

Same doubles by construction: the same function on the same input. The new
test in `master.test.mjs` pins it: on four signals (48, 44.1 and 22.05 kHz,
stereo and mono, one shorter than the 3 s window) every loudness figure
`analyze` returns is `Object.is` the standalone reading, and a tail-padded
`loudnessRange` ignores shared sums. A mutation that scales the shared sums
for the short-term reading by 1.0000001 fails it.

`analyze` also runs on the studio page (`index.html` imports `master.mjs`) on
every render a visitor checks, so the saving reaches visitors, not only CI.

## After

| measure | before | after | how |
|---|---:|---:|---|
| `analyze`, 3 min stereo 44.1 kHz | 1.88 / 1.64 s | 1.23 / 1.39 s | scratch bench, 3rd of 3 calls, two runs alternating; output hash `971796f0cc40726a` both |
| `ep-queue.test.mjs` alone | 18.1 / 18.2 s | 14.6 / 14.7 s | `node --test`, `git stash` for before |
| `ep-page.test.mjs` alone | 7.5 / 7.9 s | 6.6 / 6.8 s | same |
| `ep.test.mjs` alone | 4.7 / 4.4 s | 3.9 / 4.0 s | same |
| `sing.test.mjs` alone | 15.4 / 15.5 s | 15.8 / 14.6 s | same (noise; it renders, it rarely analyzes) |
| suite, files summed | 105.6 s | 100.4 s | `suite_file_times.py chant-forge` (after includes the new test) |
| suite wall, 4 jobs | 41.6 / 42.2 s | 40.8 / 39.8 s | `run_venture_tests.py chant-forge`, alternating |

The suite wall moves little: it is bounded by its two longest files run in
parallel, and `sing.test.mjs` (15 s) is now level with `ep-queue.test.mjs`.

## Not changed, ranked for the next run

1. **`sing.test.mjs` (15 s, 32 tests)** is now the joint floor and has had no
   per-function profile.
2. **`truePeak` (3.1 s self in `ep-queue`)**: the bounds already skip most
   windows. `analyze` reads it on both channels with the running `floor`; what
   is left is the per-phase tight bound on limited audio near its ceiling.
3. **`coverPixels` (1.8 s)** in `ep-core.mjs` draws the release cover per
   build; `ep-queue` builds two releases, so two covers. A memo on its inputs
   would need the buildEp / buildQueue callers checked for mutation.
4. The render limiter's `integratedLufs` (1.7 s) is inherent: each pass reads
   a changed signal. The 2026-11-14 note's pass-count item (a ceiling margin)
   is a product decision.
5. P063 and P064 remain owner-gated (workflow files).
