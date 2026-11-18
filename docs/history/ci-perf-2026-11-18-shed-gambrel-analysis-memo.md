# Perf, 2026-11-18: shed-designer, the gambrel truss analysis remembered by the fields it reads

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` (CODEOWNERS, owner-gated), so this run took the third-slowest
venture suite in `platform/ci/venture_suite_times.json`, shed-designer
(472 s under the four-suite pool; league-schedule-generator and
shift-roster-builder, above it, had four perf passes this week).

## Reading

- `python3 platform/ci/suite_file_times.py shed-designer --jobs 4` on this
  4-core container, main at `822bb9b49`: 659.4 s summed over 59 files, 170.0 s
  wall. Slowest: `browser.test.mjs` 113.5, `designsearch.test.mjs` 86.7,
  `gallery.test.mjs` 84.7, `fuzz.test.mjs` 74.2, `finishing.test.mjs` 45.0,
  `crossfeature.test.mjs` 38.9.
- `node --cpu-prof designsearch.test.mjs` (22.8 s sampled), self time summed
  per function: GC 11.4%, then `solveFrame` (gambrel.mjs) 10.4%, its `side`
  5.2%, `at` 4.3%, `prefix` 2.3%, plus two closures in `gambrelAnalysis`
  about 3.8%: **about 26% of the file is the gambrel truss analysis**.
- Why: `gambrelAnalysis(d)` is called from `eaveWallLoads` (model), the model
  build, the structural checks (three places) and `utilisation`. Counting
  calls during one `invariants()` of a gambrel with a half loft: **83 calls
  for 17 distinct inputs** (the auto-sizing probes ask about the same truss
  again). Each call solves the three-hinged frame for three or four load
  cases (240 load slices, 121 sections a side).
- `fuzz.test.mjs`'s profile is flat (GC 12%, `buildFramed` 6.5%, the
  plate-joint search `jointSets` 6%), and only a quarter of its designs are
  gambrels; it was not the place to start.

## Change

`ventures/shed-designer/gambrel.mjs` only:

- `ANALYSIS_FIELDS`: the twelve design fields the analysis reads (with
  `gambrelShape` and `kneeRun`): width, pitch, gambrelLower, gambrelKnee,
  rafterSize, rafterSpacing, studSize, tieSize, loft, loftJoist, snowLoad,
  windLoad. Found both by reading the source and with a `Proxy` that records
  every property read; the two lists agree.
- `gambrelAnalysis(d)` keys a `Map` on those values (strings JSON-quoted,
  `-0` kept apart from `0`, every other value as `typeof:value`), so a design
  that differs only in a field the analysis never reads shares the answer. A
  field holding an object or function (junk from a pasted link) bypasses the
  memo and is worked out as before. The map clears at 2,000 keys.
- Answers are deep-frozen: a caller that writes into one throws (ES modules
  are strict) instead of changing the next caller's answer. No caller writes
  to it; the whole suite passes with the freeze in place.
- The uncached analysis is exported as `analyseGambrel` for the test.

## Verification

- **Same answers.** A scratch script (`same.mjs`, in the run's scratchpad)
  hashes, for 381 designs (300 seeded fuzz designs with every other one turned
  into a gambrel with each loft, the 72 all-pairs cross-feature designs and
  every preset; 212 gambrels in all), `buildShed`, `estimate`,
  `structuralChecks`, `connectionChecks`, `utilisation`, `invariants` and
  every drawing sheet's SVG: **`db0afc6e0a876d96` before and after**.
- `node ventures/shed-designer/make-gallery.mjs --check`: "gallery-data.mjs is
  current" before and after (the committed gallery is byte-identical).
- New test in `gambrel.test.mjs`: for 24 gambrel variants (every loft, wind
  on/off, auto and set knee, both stud sizes, five widths, four snow loads)
  the memoised answer deep-equals a fresh `analyseGambrel` run through a
  read-recording `Proxy`, and the recorded reads equal `ANALYSIS_FIELDS`
  exactly; a field outside the key shares the cached object, one inside does
  not; answers are frozen and a write throws.
- `python3 platform/ci/run_venture_tests.py shed-designer` (the CI command):
  `ok shed-designer (139.8s, 538 tests)`, 3 skipped (axe not installed), 0
  failed.

## Numbers

| | before | after |
|---|---|---|
| `gambrelAnalysis` frame solves in one gambrel `invariants()` | 83 | 17 |
| `node --test designsearch.test.mjs gambrel.test.mjs`, interleaved | 16.6, 25.2, 23.1 s | 13.7, 15.7, 11.9 s |
| median | **23.1 s** | **13.7 s** |
| `make-gallery.mjs --check` (the Pages build's 17 s step), interleaved | 12.84, 12.37, 12.26 s | 11.27, 11.04, 11.18 s |
| `suite_file_times.py shed-designer --jobs 4`, summed over files | 659.4 s | 592.3 s |
| same, wall | 170.0 s | 152.6 s |
| same, `designsearch.test.mjs` | 86.7 s | 39.3 s |

Wall-clock on this 4-core container, `date` around each run; the A/B runs
alternated a `git archive HEAD` copy of the venture with the working tree.
designsearch starts worker threads, hence the spread. The same saving reaches
visitors: the page's auto-sizing and "search for cheaper designs" call the
analysis the same way in the browser.

## Not changed, ranked for the next run

1. **`fuzz.test.mjs`, 73.5 s under the pool, flat profile.** The plate-joint
   search in `model.mjs` (`jointSets` / `choosePlates`, about 10% with its
   `clearOf` closure) re-explores dead positions: up to 300 top-plate joint
   sets, each with a fresh cap search of up to 400 dead ends. Memoising dead
   subtrees per cap search is exact only if it charges the same budget
   (record each dead subtree's budget cost and subtract it on a revisit);
   sketched, not written.
2. **`buildFramed` self time** (6.5% of fuzz): a 1,000-line function; split it
   before profiling inside it.
3. **`browser.test.mjs`** (108.8 s): half SwiftShader
   (`ci-perf-2026-11-16-shed-viewer-one-frame-per-picture.md`).
4. **`gallery.test.mjs`** (79.7 s): the full gallery search in workers;
   faster now by this change's share, still the second-largest file.
5. P063 and P064 remain owner-gated (workflow files).
