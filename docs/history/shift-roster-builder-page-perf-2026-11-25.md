# Shift Roster Builder page: the seven file importers load on the first file pick (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for the
owner, so this run took a visitor-facing item.

## Sweep

`node platform/perf/module-weight.mjs .` on `48c3836a3`: shed-designer 355 kB
gzip, ai-bookkeeper 324 kB (both already trimmed by earlier passes),
xer-schedule-check 209 kB (trimmed 2026-11-23), changepoint-detector 196 kB (it
already moves its analysis to a worker), then **shift-roster-builder 178 kB over
13 files**, which no perf pass had touched.

## Reading (before)

`node platform/perf/module-exclusive.mjs ventures/shift-roster-builder/index.html`
plus `gzip -9c <file> | wc -c` for the importers that share code with each other:

| module | kB gzip | used by |
|---|---:|---|
| `calc.mjs` (+ `bnp.mjs`) | 117 + 11 | everything: parsing, building, every report |
| `import-7shifts.mjs` | 9.5 | staff and shift import (7shifts JSON) |
| `import-deputy-staff.mjs` | 8.2 | staff import (Deputy JSON) |
| `import-shifts.mjs` | 7.1 | shift import (CSV), and the base of every JSON shift importer |
| `import-deputy.mjs`, `import-square.mjs`, `import-wheniwork.mjs` | 5.8, 5.8, 5.3 | shift import (JSON) |
| `import-staff.mjs` | 4.8 | staff import (CSV) |
| `staffpack.mjs` | 2.8 | the paid staff pack (dark until a checkout link is set) |

The seven importers (46.5 kB gzip, 26% of the page's modules) run only inside
the two `<input type="file">` change handlers, yet every visitor downloaded,
parsed and linked them. The Pages build turns the static graph into
`modulepreload` links (`platform/pages/preload.mjs`), so on the live site they
also competed with `calc.mjs` for the first round trips.

Throttled load (local gzip static server, Chromium with the cache off, 150 ms
RTT, 1.6 Mbit/s, CPU 4x slower; `loadEventEnd`, which waits for the module
scripts; 7 runs, median): **1,735 ms**, 218.7 kB transferred.

## Change

`index.html`: the seven static importer imports became two memoised `import()`
loaders through the same `onDemand` helper the league and XER pages use (a
failed load clears the memo, so the next pick retries). `staffImporters` loads
the three staff importers on the first staff file; `shiftImporters` loads the
five shift importers on the first shift file. `runShiftsImport` became `async`
(the location and family pickers call it again without a re-upload), and the
file handler awaits it before filling the pickers. A load failure now says so
in the status line instead of doing nothing.

Kept static, on purpose: `calc.mjs` (the editors, example, build and every
report call it synchronously; splitting a 394 kB module with 105 exports is a
separate, larger job), `staffpack.mjs` (2.8 kB, and its button calls
`window.open`: an `await` before it risks the popup blocker for no real gain),
`licence.mjs`, `checkout.mjs` and `usage.mjs` (about 2 kB together, used on
load).

## Verification

- **Same answers.** A Playwright script served the old page (`HEAD`'s
  `index.html` copied beside the modules) and the new one, then fed both the
  same files through every importer path: a staff CSV, a staff CSV with no name
  column, Deputy staff JSON (four files), 7shifts staff JSON, a two-location
  shift CSV (then the location picker changed), Square, When I Work (then the
  picker changed) and 7shifts shift JSON, and Deputy shift JSON. The status
  line, the staff and shifts text, both pickers' options and the picker row's
  visibility were identical in all 14 states. No page errors on either. The old
  page fetched 7 importer modules at load, the new one 0.
- **Tests.** `page.test.mjs`: the static-import list drops the importers, and a
  new test checks no importer is imported statically, that both loaders exist,
  and that every name each handler takes from a loader is exported by one of its
  modules. A mutation (`looksLikeSquare` renamed in the handler) fails it with
  `shiftImporters lacks looksLikeSquareX`.
  `python3 platform/ci/run_venture_tests.py shift-roster-builder`: see the run
  record's `notes`.

## After

| | before | after |
|---|---:|---:|
| modules in the static graph | 13 | 6 |
| module weight (`module-weight.mjs`) | 178 kB gzip | 133 kB gzip |
| transferred at load (throttled) | 218.7 kB | 171.0 kB |
| load event, median of 7 (throttled) | 1,735 ms | 1,490 ms |

## Not changed, ranked for the next run

1. **`calc.mjs`, 117 kB gzip in one module.** The page needs parsing and the
   sample on load, but the builder (`buildRoster`, `planWeeks`, the
   branch-and-price in `bnp.mjs`) already has `roster-worker.mjs`. Moving the
   report and export helpers out behind a worker or `import()` is the next real
   lever; it needs a profile of which exports run before the first build.
2. **ifc-quantity-takeoff, 169 kB gzip.** `viewer.mjs` + `view-mesh.mjs`
   (18 kB) and `diff.mjs` (10 kB) are used only after a model loads or when two
   revisions are compared; the whole STEP parse and takeoff chain could also wait
   for the first file.
3. **sales-agent, 133 kB gzip.** `ai.mjs`/`byok.mjs` (9 kB) and
   `mailfile.mjs`/`mime.mjs` (8 kB) look button-only.
