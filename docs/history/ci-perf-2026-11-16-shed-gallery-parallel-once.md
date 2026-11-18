# shed-designer gallery.test.mjs: the worker search runs once, 50.4 s to 36.9 s (2026-11-16)

Perf track. Both open perf backlog items (P063, P064) touch CODEOWNERS paths and
wait for the owner, so this run took a venture suite instead.

## Reading

`platform/ci/venture_suite_times.json` (2026-11-15) ranks shed-designer fourth
(472 s with four suites in parallel). Each of its 58 test files run alone, one
after another, on this 4-core container (`node --test <file>`, wall time):

| file | s |
|---|---|
| browser.test.mjs | 68.4 |
| gallery.test.mjs | 50.8 |
| fuzz.test.mjs | 27.6 |
| picker.browser.test.mjs | 26.4 |
| designsearch.test.mjs | 19.3 |
| the other 53 | 122.7 |
| **sum** | **315.2** |

Per test inside gallery.test.mjs (`--test-reporter=spec`):

- "the search run now gives a valid gallery ..." 13.4 s: `gallerySearchesParallel()`
  (three searches in worker threads) and `generateGallery` on its result.
- "a search run in a worker thread equals the same search run here ..." 36.6 s:
  `gallerySearchesParallel()` again (about 13 s) plus `gallerySearches()` (the
  same three searches serially on the main thread, about 23 s).

The second parallel run recomputes exactly what the first test already had.

## Change

A file-local memo, `parallelOnce()`, holds the promise of the one parallel run;
both tests await it. Nothing else changed: the comparison is still the worker
result against a fresh serial run, and the `includes` identity checks still
run on the objects that crossed the thread boundary.

Why sharing is sound, checked before the change with a scratch script:

- `generateGallery(undefined, runs)` leaves `runs` unchanged:
  `JSON.stringify(runs)` (11,445,456 characters) is identical before and after.
- Two parallel runs give identical JSON, so the second run could never have
  shown anything the first did not.

The test that compares workers to serial still passes run alone
(`--test-name-pattern "worker thread"`), since the memo fills on first use.

## After

`node --test gallery.test.mjs`, same container, twice: **36.7 s and 37.1 s**
(before 50.4 s; the file alone, 50.8 s in the sweep). All 5 tests pass. Saves
about 13.5 s of wall time and about 3 cores x 13 s of CPU on every
shed-designer test run.

## Not changed, ranked for the next run

1. **browser.test.mjs, 68.4 s**: the largest file; not profiled this run.
2. **The serial `gallerySearches()` in the worker-equality test, 23 s.** The
   test's own comment says only the cheapest search's costs need comparing; a
   test that compared only `free` serially would save about 15 s but checks
   less (house and barn costs), so it is a test change, not a speed-up.
3. **Overlapping the serial run with the workers.** The serial search blocks
   the main thread, and `gallerySearchesParallel` awaits a dynamic import
   before it starts workers, so the workers would not start until the serial
   run ends. Would need the worker start made synchronous.
4. fuzz.test.mjs (27.6 s) and picker.browser.test.mjs (26.4 s): not profiled.
5. P063 and P064 remain owner-gated.
