# changepoint-detector: one first pass per trend search, each knot set fitted once (2026-11-12)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflows and wait for the owner, so the run took step 2 and 3 of the prompt.

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 25` (runs 2026-11-12T18:11Z
to 18:39Z, 270 job-minutes): "node --test in each touched venture" is 18.1
job-minutes over 17 jobs, second after Pages' "Test the site builder" (many
passes already). The ventures most touched by the last 150 commits on `main`,
timed here with `python3 platform/ci/run_venture_tests.py <slug>` (4 cores):

| venture | suite |
|---|---|
| einvoice-preflight | 8.0 s |
| shift-roster-builder | 197 s |
| hearth-and-horizon | 2.1 s |
| quick-pick-survey | 0.1 s |
| **changepoint-detector** | **236.8 s** |

(photo-editing's own CI was also read: 51 s locally, of it 25 s in
`test_ffmpeg_pipeline`, which is ffmpeg encoding the test's own 46 s clips;
nothing to cut without changing what the test checks.)

In changepoint-detector the slowest tests, from the TAP `duration_ms`, are
the trend-bend ones: "trend bends with sticky noise" 42.4 s, the
`eval/drift-warning-null195-ar1.mjs` output check 37.0 s, its sibling 29.3 s,
"count trend bends" 22.9 s, and five more `--joint-knots`/bend tests at 9 to
18 s each.

## Profile

A bench of the first test's 120 `analyze({ trend: 'bends' })` calls (40 seeds,
plain, `--ar1`, `--ar1 --period 12`; hash of `JSON.stringify` of every
result), under `node --cpu-prof`, self time summed per function: 27.1 s, of it
**20.6 s in `pelt`**, 1.9 s `median`, 1.0 s `ar1Rho`, 0.9 s `robustSd`.
Counting: 31,483 calls of `trendAdjust`'s `fit(knots)`, which made 159,219
`pelt` calls on n = 240 (2.46 billion inner-loop steps, about 8 ns each). Two
earlier passes already tightened `pelt`'s loop
(`ci-perf-2026-11-11-pelt-inner-loop.md`,
`ci-perf-2026-11-11-median-select-pelt-one-pass.md`), so this run cut calls,
not steps.

- Every `fit` starts all its slopes at `median(d)`, so its first pass removes
  `s0 * (t - c)` plus, per knot, `(s[j+1] - s[j]) * (t - knot)` with the
  difference exactly 0: the same line, bit for bit, whatever the knots. One
  `pelt` per fit (31,483 of 159,219) recomputed the same answer.
- 28,376 of the 31,483 knot sets were distinct: the greedy grid, the
  one-point refinement and the knot-range scan revisit about 10%.

## Change (`ventures/changepoint-detector/engine.mjs`, `trendAdjust`)

- The first pass's steps are computed once per `trendAdjust` call and reused
  by every fit (`firstSteps`); `median(d)` is computed once.
- `fit(knots)` is memoised by `knots.join(',')`; `fitOnce` is the old body.
  Callers only read the returned object (every knot list they build is a copy).

## Verification

- **Same answers.** Bench hash `6ddb47e842432d62` before and after.
  `node eval/drift-warning-null195-ar1.mjs` is byte-identical to the committed
  `eval/drift-warning-null195-ar1.out.txt` (`cmp`), and the suite's other
  committed-eval checks pass unchanged.
- **Faster.** Bench 27.1 s to **20.8 s**; the null195-ar1 eval 37.0 s to
  **27.9 s** (`date` around one run each).
- Full suite (`run_venture_tests.py changepoint-detector`): SUITE_RESULT.

## Not changed, ranked for the next run

1. `pelt` is still most of the trend-bend time: about 115,000 calls remain,
   each a different detrended series. Replacing `/ s2` by a precomputed
   reciprocal would cut a division per step but changes the last bit of each
   cost, so ties could move; not done without a proof that it cannot.
2. The fit's passes 1 to 9 could start from the previous knot set's slopes
   (warm start), which would cut passes but can land on a different fixed
   point: an output change, so a product decision, not a perf one.
3. shift-roster-builder (197 s) is the other heavy suite of a busy venture;
   it had two passes on 2026-11-11 and 2026-11-12.
4. P063 and P064 remain owner-gated.
