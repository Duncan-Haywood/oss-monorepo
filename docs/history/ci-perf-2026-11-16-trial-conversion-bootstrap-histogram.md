# trial-conversion-timing-analyzer: the bootstrap bins each trial once (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. The suites at the top of
`platform/ci/venture_suite_times.json` have had many perf passes already, so
this run timed the next tier, which nobody had profiled. That tier has
gitignore-explainer, rrule-explainer, trial-conversion-timing-analyzer and
saas-feature-packaging-optimizer.

## Reading

Wall time for `node --test '*.test.mjs'` in each venture directory, one run each:

| venture | suite | longest test |
|---|---|---|
| gitignore-explainer | 3.1 s | (spread out) |
| rrule-explainer | 8.3 s | three randomized-rule sweeps, 2.3 to 3.0 s each |
| trial-conversion-timing-analyzer | **9.4 s** | `200,000 trials are analysed without a stack overflow`, **9.36 s** |
| saas-feature-packaging-optimizer | 10.3 s | `the search stays fast at the largest size`, 7.8 s |

In trial-conversion, one test took 99% of the suite. A browser user with a
large export waits the same 9 s, because the page runs the same `analyze`.

## The cost

`analyze` estimates an 80% bootstrap range for each shorter trial length
T = 1..L-1. On each of B = 300 resamples it built a sample array of n rows,
filtered and mapped it to conversion days, and then filtered that again once
per T. At n = 200,000 and L = 14, that is 300 × (200k pushes, a 200k filter,
a 50k map and 13 filters over 50k values), all allocating.

## The change

`ventures/trial-conversion-timing-analyzer/calc.mjs`:

- Each matured trial's conversion day is turned into a bin once:
  `min(ceil(paid - start), L)`, or -1 when the trial did not convert. Every
  candidate T is a whole number below L, and for whole-number T, `d > T`
  holds exactly when `ceil(d) > T`. So the count after day T is a suffix sum
  over an (L+1)-slot histogram.
- Each resample makes the same `rand()` draws in the same order, increments
  the histogram, and walks T from L-1 down to 1. The shares are the same
  integer counts divided by the same base, so the floats come out the same.
- The per-day curve counted `conv.filter(x => x === d)` once per day (121
  passes). `conv` is already sorted, so a single cursor now counts it.
- **Bug fixed along the way:** `maxDay` used `Math.max(L, ...conv)`. That is
  the same spread the red team removed from `latest` on 2026-11-14, and it
  still threw `RangeError: Maximum call stack size exceeded` once a dataset
  had about 125k+ conversions. It is now a reduce. A new test,
  `175,000 conversions are analysed without a stack overflow`, failed on the
  old code (RangeError) and passes now.

## Verification

- A scratch harness ran `analyze` on the 200k test input, 300 seeded random
  datasets and the built-in sample, then wrote `JSON.stringify` of every
  result. The datasets covered n from 30 to 3,030, L from 2 to 41,
  non-integer conversion days in every fifth set, conversions far past L,
  and all four pullForward values. Old and new output: **`cmp` identical**
  (2,245,986 bytes).
- Suite: 29 → 30 tests, all pass.

## Numbers

| | before | after | how |
|---|---|---|---|
| `analyze` on the 200k test input | 9,044 / 9,152 / 9,277 ms | 856 / 892 / 966 ms | `performance.now()` around the call, 3 runs |
| test `200,000 trials …` | 9,359 ms | 971 ms | node spec reporter |
| whole suite, wall | 9.4 s | 1.3 s (2.0 s with the new 175k test) | `date` around `node --test '*.test.mjs'` |

Most of the remaining ~0.9 s is the 60M seeded `rand()` draws. Fewer draws
would change the bootstrap ranges, so this run left them alone.

## Not changed, ranked for the next run

1. **saas-feature-packaging-optimizer**: `the search stays fast at the largest
   size` takes 7.8 s, and four more tests take about 0.46 s each. Next target.
2. **rrule-explainer**: three randomized sweeps of 2.3 to 3.0 s each against
   dateutil fixtures. Profile `rrule.mjs` expansion before touching the tests.
3. **trial-conversion `meanDaysToPay` / `lateShare`**: 13 filters over `conv`
   per call. Under 5 ms at 50k conversions, so not worth changing.
