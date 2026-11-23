# ids-model-check: range checks read each value once (2026-11-23)

Perf track. Both perf items in the process backlog (P063, P064) touch workflow
files in `.github/CODEOWNERS` and wait for the owner, so this run took item 3
of the track's list: a test suite agent sessions wait on. `ids-model-check`
had 21 commits in the last 200 on `main` (second only to `xer-schedule-check`)
and had never been timed (`platform/ci/venture_suite_times.json`, taken
2026-11-17, predates it).

## Reading (before, `b3566e386`)

- Pages builder suite, for reference: 5 min 3 s wall on 4 cores, 1,941 tests;
  236 s of it is the first test that waits on the shared `site()` build. That
  path has eighteen earlier write-ups (`pages-test-perf-*`), so it was left.
- `ci_profile.py --runs 600`: Portfolio Pages 212.7 job-minutes, Portfolio
  validate 106.6, ventures tests 86.3 of 653.0 in the window
  (2026-11-22T22:26Z to 2026-11-23T00:18Z).
- `run_venture_tests.py` on the three most-touched untimed ventures:
  ifc-quantity-takeoff 5.0 s, xer-schedule-check 6.5 s, ids-model-check 14.2 s
  (in parallel); ids-model-check alone 10.9 s / 10.9 s.
- `suite_file_times.py ids-model-check`: `time-pattern.test.mjs` 4.1 s for 3
  tests, the slowest file.
- `node --cpu-prof` of that file, self time: `temporalKey` 740 ms, `exactKey`
  588 ms, `xmlTrim` 253 ms, `temporalKind` 244 ms, the per-call `z` closure
  224 ms. All of it product code, not test code.

## Cause

`IdsValue.match` (`ids.mjs`) checks a value against a date, time or duration
range by calling `temporalCompare(v, bound)` once per bound. Each call ran
`exactKey` on both sides, and `exactKey` classified the string
(`temporalKind`: trim plus up to four regexes), then called `temporalKey`,
which classified and trimmed it again. With two bounds a value was read about
seven times, and the bounds, the same few strings for every value in a model,
were re-read on every call.

## Change

`ventures/ids-model-check/temporal.mjs` only:

1. `keyOf(trimmed, kind)` holds the body of `temporalKey`; `temporalKey` and
   `exactKey` call it after classifying once. The zone regex and its helper
   are hoisted out of the call.
2. `exactKey` is memoised in a `Map` keyed by the string, emptied at 4,096
   entries so a model with millions of distinct values stays bounded. Its
   results are frozen; every caller already copied them (`{ ...x }`).

## Verification

- A benchmark script (60,005 generated times, dateTimes, dates and durations,
  with zones, fractions past the millisecond, whitespace, 24:00:00 and a day
  the month lacks; each through `temporalKind`, `temporalKey`, two
  `temporalCompare`s and five parsed IDS ranges, results written as JSON):
  output byte-identical before and after (`cmp`; sha256 prefix
  `c40fb2b875720a09` both sides).
- Full suite: 518 tests, 2 skipped as before, green, plus the site page checks.

## After

| measure | before | after |
|---|---|---|
| benchmark, 60,005 values x 9 checks | 1,010 / 937 / 929 ms | 336 / 373 / 359 ms |
| four temporal test files, `--test-concurrency=1` | 9.7 / 10.1 / 9.9 s | 8.3 / 8.2 / 8.3 s |
| `time-pattern.test.mjs` alone (`suite_file_times.py`) | 4.1 s | 3.0 s |
| whole suite, `run_venture_tests.py --no-page-checks` | 10.9 / 10.9 s | 9.7 / 10.1 s |

The suite gain is small (about 1 s); the gain that matters is the checker's:
a range requirement over a large model's property values now costs about a
third of what it did, in the browser, for every user.

## Not changed, ranked for the next run

1. **`time-pattern.test.mjs` is now mostly the generated pattern regexes**
   (577 ms self in V8's regex engine): the test's own exhaustive sweep, which
   is the point of the test.
2. **`editor.test.mjs`, 3.2 s for 39 tests**: not profiled.
3. **`date-range-lang.test.mjs`, 2.8 s**: not profiled.
4. **The Pages builder's shared build** (236 s of a 5 min local suite): read
   the `pages-test-perf-*` series before starting.
5. P063 and P064 remain owner-gated (workflow files).
