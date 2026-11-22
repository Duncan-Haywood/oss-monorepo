# ids-model-check: the dateTime sweep compiles its regex once per range (2026-11-22)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflows and wait for the owner, so this run timed the node suites of the
three ventures most recently landed on `main` (`xer-schedule-check`,
`ifc-quantity-takeoff`, `ids-model-check`) file by file.

## Reading (before)

Per-file wall time, `node --test <file>`, one file at a time:

| file | s |
|---|---|
| ids-model-check `datetime-range-pattern.test.mjs` | 8.0 to 8.5 (3 runs) |
| ids-model-check `time-pattern.test.mjs` | 4.3 |
| ids-model-check `editor.test.mjs` | 3.8 |
| ids-model-check `date-range-lang.test.mjs` | 3.1 |
| everything else in the three ventures | under 2.1 each |

`node --cpu-prof datetime-range-pattern.test.mjs`, self time summed per
function: 8,278 ms in total, **6,883 ms self in the test's own `sweep`**, then
`temporalKey` at 274 ms. Matching the compiled patterns showed up only as
tens of ms. The self time was regex compilation. `sweep` built
`new RegExp(\`^(?:${re.source})$\`, "v")` inside its loop over about 2,000
candidate strings per range, 23 ranges in all, so it compiled a pattern of
several kilobytes about 46,000 times to test it once each.

## Change

`ventures/ids-model-check/datetime-range-pattern.test.mjs`: build the anchored
`RegExp` once per range, before the loop. It has no `g` or `y` flag, so
`test()` keeps no `lastIndex` and reusing it cannot change any answer.

## Verification

- Same answers: with a `console.log` of each sweep's range, `compared` and
  `allowed` counts added to the old and new files, the 23 lines hash the same
  (md5 `7d349f68…`, both).
- `node --test datetime-range-pattern.test.mjs`: 4/4 pass.
- `python3 platform/ci/run_venture_tests.py ids-model-check`: 495 tests,
  0 failed, 2 skipped (the same as before).

## After

| measure | before | after |
|---|---|---|
| `datetime-range-pattern.test.mjs` alone | 8.0 to 8.5 s | 1.42 to 1.49 s (3 runs) |
| `run_venture_tests.py ids-model-check` suite | 13.5 s | 11.7 s |

The suite gains less than the file because `node --test` runs files
concurrently. The file is no longer the longest, and `time-pattern` and
`editor` now set the suite's wall time. About 6.7 s of CPU comes off every
ventures-tests job and every local run that reaches `ids-model-check`.

## Not changed (ranked, for the next run)

1. `time-pattern.test.mjs` (4.3 s) and `datetime-pattern.test.mjs` (2.1 s):
   the time is spread over product code in `temporal.mjs`: `temporalKey`
   784 ms, `exactKey` 658 ms, `temporalKind` 266 ms and `xmlTrim` 241 ms.
   Each re-parses its value on every comparison. A per-string memo or a
   parse-once key would help the checker as well as the tests, but it is a
   product change and needs its own pinning test.
2. `date-range-lang.test.mjs` (3.1 s): 1,531 ms self in `findOutside`
   (`pattern-lang.mjs:336`), the product's inclusion search. `keyOf` joins
   arrays into string keys for every tuple, and `closure` sorts on every
   step. This is the place to look, but it is search code that also runs on
   users' pages.
3. `editor.test.mjs` (3.8 s): not profiled.
