# Perf: ai-bookkeeper remembers which keyword rules match a description (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run went to the venture suites again.
League, shift-roster, shed and changepoint have had many passes this week;
ai-bookkeeper (115.6 s in `venture_suite_times.json`, 2026-11-16T03:01Z, four
suites at a time) had one (`ci-perf-2026-11-14-bookkeeper-header-lookup.md`).

## Reading

- Every one of the 325 test files alone, four at a time (`xargs -P 4`, this
  container, 4 cores): 133.5 s summed, median 0.26 s, floor about 0.19 s
  (`node --test` on a trivial file). So about half the summed time is process
  start-up; the rest is spread thin. Slowest: `import-order-property` 5.9 s,
  `estimatedtax-property` 3.8 s, `fuzz` 3.7 s, `metamorphic` 3.7 s.
- `node --cpu-prof import-order-property.test.mjs` (3.95 s of samples),
  inclusive: `importStatement` 2.96 s, of which `categorize` 1.85 s and
  `suggest` 1.40 s; **`suggest` self 0.78 s**, the largest self entry, then
  `clone` (JSON round trip) 0.52 s and GC 0.26 s.

`suggest`'s self time is regex execution: `BUILT_IN` holds 499 keyword
regexes (36.8 kB of source), and a description that matches none of them
(most of a statement that has no rule yet) is tested against all 499, about
25 to 50 us per call. `categorize` re-suggests every open line on every pass,
and every import runs a pass, so the same descriptions meet the same 499
regexes again and again. A union regex of all 499 is no answer: 400 to
1,900 us per test, 15 to 40 times slower (V8 loses each regex's own quick
scan).

## Change (`ventures/ai-bookkeeper/categorize.mjs`)

`builtInHits(text)`: the indices of the `BUILT_IN` regexes that match `text`,
in list order, memoised in a module-level `Map` (cleared at 20,000 entries).
None of the 499 regexes has a `g` or `y` flag (checked), so `test` keeps no
state and the answer for a text never changes. The three scans read it:

1. the keyword check before the classifier is trusted (`BUILT_IN.some`),
2. the built-in loop, which now walks the hits only, with the same direction
   and chart-of-accounts filters, in the same order, and so returns the same
   first match (the `re.test(bi)` in the loop is then always true and went),
3. the brand path's `kw` (`BUILT_IN.find`).

## Verification

- Same answers: a scratch script ran the old `categorize.mjs` (from `HEAD`)
  and the new one side by side on 1,048 descriptions (every row of every
  readable fixture plus text drawn from each regex), money in and out, with
  and without a chart filter, with and without a trained classifier: 8,384
  `suggest` calls, sources built-in 2,740, brand 12, learned 26, none 5,606;
  **0 differences**, also on the second (memoised) call.
- `python3 platform/ci/run_venture_tests.py ai-bookkeeper`: 3,273 tests pass,
  1 skipped (no tesseract, as before).

## Numbers (this container, 4 cores, wall time)

| what | before | after |
| --- | --- | --- |
| `node --test import-order-property.test.mjs`, three runs | 3.68 / 3.64 / 3.88 s | 1.90 / 1.99 / 1.85 s |
| `engine.test.mjs` | 1.44 / 1.55 / 1.45 s | 1.24 / 1.27 / 1.35 s |
| `estimatedtax-property.test.mjs` | 2.74 / 2.67 / 2.64 s | 2.49 / 2.35 / 2.43 s |
| `metamorphic.test.mjs` | 2.26 / 2.43 / 2.25 s | 2.21 / 2.08 / 2.16 s |
| `fuzz.test.mjs` (reading files, not suggesting) | 2.61 / 2.64 / 2.74 s | 2.72 / 2.81 / 2.56 s |
| `run_venture_tests.py ai-bookkeeper`, alternated | 33.0 / 35.3 s | 29.4 / 29.6 s |

The same saving reaches people using the app: each import in the browser
re-suggests every open line, and a year of lines that no keyword knows was
the expensive case.

## Not changed, ranked for the next run

1. `clone` in `engine.mjs` (`JSON.parse(JSON.stringify(books))`), 0.52 s self
   in the same profile: every `importStatement` and `categorize` copies the
   whole books. `structuredClone` is not a drop-in (it keeps `undefined`
   fields and would change saved output); a copy-on-write of only
   `transactions` would need every writer audited.
2. `readStatement` 0.82 s inclusive in the same profile, mostly
   `pickDelimiter` and `parseCsv` on tiny files.
3. Process start-up: about 60 of the 133 summed seconds are `node --test`
   start-up across 325 files. Merging files is a test-layout change for the
   venture's owner, not a perf-run edit.
