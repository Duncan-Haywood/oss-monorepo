# CI perf, 2026-11-14: chant-forge true peak, a central-taps bound; limiter scratch; the `--limit` test split

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
`.github/workflows/` and wait for the owner, so this run timed the venture
suites instead (step 3 of the prompt). Of the 50 suites with the most test
bytes (minus the seven with a perf pass in the last two days), chant-forge was
the slowest at 24.7 s, then clothing-design-studio 14.0 s and
babysitting-business-kit 6.6 s; the other 47 took under 3.6 s each.

## Reading

This 4-core container, node 22.23.4, nothing else running.

- Per file: **`render.test.mjs` 20.0 s**, `ebu-tech3342` 6.0 s, `split` 2.8 s,
  `ebu-tech3341` 2.8 s, the rest under 2 s. One file was the suite's tail.
- Inside it, the `--limit` test 12.5 s (one render: 8 limiter passes on
  Dies irae over deep house, 8.43 M samples a channel), the full-arrangement
  test 3.8 s, the `--lufs` test 2.9 s.
- A bench (`renderMidi` with `{}`, `{targetLufs:-14}` and
  `{targetLufs:-14, limit:true, stems:true}` on that piece, sha256 of every
  channel, stem and metadata field) took 0.97 s, 1.04 s, **11.38 s**.
  `node --cpu-prof` self time: **`truePeak` 4.56 s**, `renderMidi` 2.69 s,
  `limiterCurve` 2.16 s, `kWeightedEnergy` 1.77 s.

Logging each limiter pass showed why the true-peak meter's skip did little
(the last two perf notes said so too): after pass 0 the sample ceiling is
0.766 and the true peak sits at 0.886, but the skip bound is
`sum|taps| x block max`, and `sum|taps|` is 2.07 to 2.49 for the three
phases, so a block near the ceiling can never be ruled out. Counted on each
pass, the block bound skips 85% of points; the 2.5 M points left each need
three 32-tap sums.

## Change

1. **Central-taps bound (`master.mjs` `truePeak`)**: for each phase, sum the
   4 taps nearest the interpolated point exactly (`c`), and bound the rest by
   `sum|outer taps| x window max` (0.57 to 0.81, against 2.07 to 2.49 for all
   taps). If `|c| + outer x M < peak`, the full sum cannot raise the peak and
   is skipped. `outer` carries a slack of `gain x 1e-9`: the rounding error
   of either sum is under 64 ulp of `sum|x t| <= gain x M`, far below that.
   NaN fails `<` and still reaches the full sum. Points that pass still run
   the same products in the same order. Of the 7.5 M phase sums left after
   the block bound, this skips 96% (7.19 M on the last pass).
2. **`limiterCurve` scratch (`render.mjs`)**: an optional sixth argument keeps
   `need`, `mn`, `dq`, `out` and `cs` between calls of the same length;
   `renderMidi`'s 8 passes share one. Every element is written before it is
   read (`cs[0]` is reset explicitly), and only the last pass's curve is used
   after the loop. This was item 2 of the last note's ranked list.
3. **`render-limit.test.mjs`**: the `--limit` test moved unchanged to its own
   file so `node --test` runs it alongside the rest. 9 tests in
   `render.test.mjs` before; 9 + 1 after, plus the new scratch test.

## Verification

- **Byte-identical renders.** The bench's three renders give the same sha256
  before and after each change (`2211e6bf…`, `d898945f…`, `f1923cdb…`,
  overall `6938bbda79f06742…`).
- **New tests.** `master.test.mjs`'s bit-for-bit truePeak test gained four
  limited signals (clamped at 0.77 under a higher inter-sample peak, the case
  the bound exists for). Mutation check: with the outer bound set to 0 (an
  unsound bound), 2 of 13 tests fail; restored, 13 pass.
  `render.test.mjs` gained "limiterCurve with a reused scratch returns the
  same curve as fresh arrays", over five calls of mixed lengths sharing one
  scratch, compared with `Object.is`.
- **Suite**: `python3 platform/ci/run_venture_tests.py chant-forge` (the CI
  command): ok, 14.5 s.

## Numbers

Same container, bash timestamps; "before" is a `git archive HEAD` copy of
the venture run back to back with the new tree.

| | before | after |
|---|---|---|
| `--limit` render in the bench | 11.38 s | 8.09 s |
| `truePeak` self time, bench | 4.56 s | 2.05 s |
| `render.test.mjs` alone (before the split) | 21.7 s, 21.2 s | 17.4 s, 17.6 s |
| suite, `node --test *.test.mjs` | 24.5 s, 25.4 s | 14.3 s, 14.0 s (after the split) |
| `run_venture_tests.py chant-forge` | 24.7 s (timing sweep) | 14.5 s |

After the split, `render-limit.test.mjs` alone is 10.1 s and
`render.test.mjs` 7.5 s.

## Not changed, ranked for the next run

1. **`render-limit.test.mjs` is now the floor** (10.1 s, one render). In that
   render `renderMidi` self time (2.7 s, note mixing and the per-pass gain
   loops), `limiterCurve`'s deque (about 1.5 s) and `kWeightedEnergy`
   (1.8 s, 9 loudness readings of 2 channels) are what is left. The K-weighting
   is a recursive filter, so its order is its output; `integratedLufs` could
   take a scratch for its two energy arrays like `limiterCurve` does now.
2. **The limiter loop still runs all 8 passes**: from pass 1 the loudness is
   within 0.04 LU of -14, but the true peak approaches -1.05 dBTP from above
   (-1.04999981 on pass 7) and the stop test is `tpDb <= -1.05`. A small
   margin in the ceiling tweak would stop it at pass 2 and change the output:
   a product decision with its own test, not perf.
3. clothing-design-studio (14.0 s) is the next slowest suite in the sweep;
   its note `ci-perf-2026-11-13-clothing-drape-arm-reject.md` ranks
   `pushOut`'s level lookup next.
4. P063 and P064 remain owner-gated (workflow files).
