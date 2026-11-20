# changepoint-detector: synthetic-control solver works in place (2026-11-20)

**Reading.** Perf track, prompt 0. Both open perf backlog items (P063, P064)
touch CODEOWNERS paths, so this run took step 3 (the slowest local step a
session waits on). Every `*.test.mjs` in the 45 ventures most touched since
2026-11-13 was timed alone (`node --test --test-reporter=dot <file>`, this
4-core sandbox, 617 files before the sweep was stopped). changepoint-detector
held the top 12. Earlier passes covered its engine files (PELT, BOCPD, Fisher
table, trend fits); none had touched the synthetic-control files, yet
`synth-cli` (26 s), `synth-control` (22 s), `synth-page` (14 s) and
`synth-lead-range` (12 s) were all in the top 20.

**Profile.** `node --cpu-prof synth-control.test.mjs`, self time summed per
function: `projectSimplex` 7.8 s, `simplexLeastSquares` 5.5 s,
`simplexLeastSquaresRows` 4.4 s, the `.map` closures inside the FISTA loop
another 2.4 s, GC 0.45 s. The T x J solver (`simplexLeastSquares`, one call per
unit per placebo fit) allocated five arrays per iteration and projected onto
the simplex with `Array.from(v).sort((a, b) => b - a)`, a comparator sort on a
boxed array, up to 5,000 times per fit.

**Change.** `ventures/changepoint-detector/synth-control.mjs`: the FISTA loop
uses a flat `Float64Array` Gram matrix, preallocated `tmp`/`wn`/`srt` buffers
swapped instead of reallocated, and a new `projectSimplexInto` that does a
native ascending `Float64Array.sort` and reads it from the top (the same
routine `simplexLeastSquaresRows` already used). Arithmetic is the same, in
the same order: the gradient sum still starts at `-b[i]` and runs `j` upward,
`(tk - 1) / tn` is the same double whether computed once or per element, and
equal values in the sort are interchangeable. The exported `projectSimplex`
is unchanged.

**Verification (same answers).**

- 525 random problems (T x J from 5 x 3 to 40 x 60, with tied columns, three
  `iters`/`tol` settings) through the old and new `simplexLeastSquares`:
  0 weights differ under `Object.is`. Old 4,200 ms, new 1,240 ms.
- California 1989 against 38 donors (`synthControlTest` plus
  `synthInTimePlacebo`), old vs new module: the 53,575-byte JSON output is
  byte-identical (`cmp`). 5,041 ms -> 978 ms.
- Every changepoint-detector test file that imports the module (15 files)
  passes, and the whole suite passes under `run_venture_tests.py
  changepoint-detector`.

**Before / after** (each file alone, two runs each, seconds, same sandbox; the
venture timing sweep above was still running in the background for both the
before and the after runs, so both carry the same extra load and absolute
numbers are higher than on a quiet machine):

| file | before | after |
|---|---|---|
| synth-cli | 26.5 / 25.8 | 6.2 / 6.1 |
| synth-control | 22.4 / 22.5 | 9.2 / 9.3 |
| synth-page | 14.1 / 13.8 | 2.9 / 2.7 |
| synth-lead-range | 12.7 / 11.5 | 2.8 / 2.7 |
| synth-shape-trend | 3.8 / 3.7 | 0.6 / 0.6 |
| synth-anticip | 2.2 / 2.2 | 0.7 / 0.7 |
| the other 9 | 7.6 / 7.3 | 2.6 / 2.5 |
| **15 files, sum** | **89.0 / 86.5** | **24.7 / 24.0** |

**Not changed, ranked for the next run.**

1. `simplexLeastSquaresRows` (now the top self time in `synth-control`,
   5.0 s, plus 1.3 s in its `project`): the covariate fit's inner solve, run
   thousands of times under Nelder-Mead. Already flat and allocation-free; the
   lever is fewer calls (warm starts across Nelder-Mead vertices are already
   passed as `start`; check how many reach `iters`).
2. `simplexLeastSquares` still 2.8 s: the gradient is J^2 per step; with
   T0 < J (19 x 38 for Proposition 99) a residual-form step (T0 x J, as the
   Rows solver does) would halve it, but changes summation order, so it needs
   an equal-objective test, not `cmp`.
3. The engine files (`engine`, `engine-trend-bends`, `engine-trend-joint-knots`,
   30-38 s each) remain the suite's longest; see the earlier
   `ci-perf-2026-11-1*-changepoint-*` notes.
