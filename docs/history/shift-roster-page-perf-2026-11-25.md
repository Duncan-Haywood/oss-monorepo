# Shift Roster Builder: the seven export readers load on the first file pick (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch workflow files in `.github/CODEOWNERS` and
wait for the owner. Shift Roster Builder is one of the built-dark paid products
(`portfolio/monetization/models.yaml`: the staff pack) and had many engine perf
passes but no page-load pass.

## Reading (before)

`node platform/perf/module-weight.mjs .` on `ee4ef9970`: shift-roster-builder
**178 kB gzip over 13 files**, sixth in the repo (the five above it, bar
xer-schedule-check and ifc-quantity-takeoff which already had passes, are
covered too). `calc.mjs` alone is 117 kB of it and the page and its worker
need it, so it stays. `module-exclusive.mjs` put the rest in the seven export
readers, which `index.html` imported statically but calls only inside the two
file-pick handlers (staff export, schedule export):

| module | gzip bytes |
|---|---:|
| import-7shifts.mjs | 9,510 |
| import-deputy-staff.mjs | 8,165 |
| import-shifts.mjs | 7,116 |
| import-deputy.mjs | 5,838 |
| import-square.mjs | 5,799 |
| import-wheniwork.mjs | 5,271 |
| import-staff.mjs | 4,825 |

Throttled load: a local static server with gzip and `cache-control: no-store`,
the build's own `addModulePreloads` applied to both copies (as the Pages build
does), Chromium, 150 ms RTT, 1.6 Mbit/s down, CPU 4x slower, service workers
blocked, external hosts aborted; `performance` navigation `loadEventStart`;
7 runs each, before and after interleaved, median. Same conditions as the
babysitting, XER and wall-framing passes.

## Change (`ventures/shift-roster-builder/index.html` only)

- The seven `import { ... } from "./import-*.mjs"` lines are gone.
  `loadImporters()` holds one shared promise of the seven `import()`s, merged
  into one object; a failed fetch clears it, so the next pick retries.
- Both file-pick handlers were already asynchronous (`File.text()`); they now
  wait on `loadImporters()` alongside the text and destructure the same names
  as before. The schedule handler stores the loaded readers in `imp` before it
  sets `shiftsFile`, so the location and shift-family pickers (synchronous,
  and only reachable after a file is read) find them loaded.
- A failed load writes one line in `#form-status` ("The file reader could not
  be loaded. Check the connection and choose the file again.").

Kept static: `staffpack.mjs` (3 kB; the staff pack opens a window, and a
`window.open` after an `await` can be blocked), `licence.mjs`, `checkout.mjs`,
`usage.mjs`.

## Verification

- **Same answers.** A Playwright script picks the same staff CSV, a two-location
  schedule CSV, then the Airport location, then a 7shifts JSON, on the before
  and after pages, and compares `#form-status`, `#staff`, `#shifts` and the
  location picker after each step: identical, no page errors.
- **Failure path.** With `import-square.mjs` answering 404 the staff pick shows
  the one-line message; with it restored the same pick imports normally.
- **New test** `page-lazy-imports.test.mjs`: no `import-*.mjs` is a static
  import of the page, every reader in the folder is in the lazy list, and each
  name the handlers destructure is exported by one of them.
- `python3 platform/ci/run_venture_tests.py shift-roster-builder`: see the run
  record's `notes`.

## After

| | before | after |
|---|---:|---:|
| module graph on first load (gzip) | 178 kB, 13 files | **133 kB, 6 files** |
| modulepreload links the build adds | 13 (depth 6) | 6 (depth 3) |
| throttled time to `load`, median of 7 | 1,355 ms | **1,079 ms (−20%)** |

All runs: before 1504 1345 1373 1356 1338 1355 1352; after 1079 1083 1079
1086 1079 1086 1076.

## Not changed, ranked for the next run

1. **`calc.mjs` is 117 kB gzip (394 kB raw, 6,076 lines, about 1,100 of them
   comments)** and the page imports ~55 names from it. The heavy part
   (`buildRoster`, `steadyRoster`, `planWeeks`, and `bnp.mjs` under them) runs
   in `roster-worker.mjs`; the page needs it only for the no-worker fallback.
   Splitting the solver out of `calc.mjs` so the main thread loads only the
   report and parse functions would be the next big cut, but `calc.mjs` is the
   module the CLI, the worker and ~90 test files import, so it needs its own run
   with a re-export shim to keep every import working.
2. **The page and the worker each parse `calc.mjs`.** The HTTP cache serves the
   worker's copy, but it is compiled twice. Falls out of item 1.
3. **`index.html` is 111 kB raw** with two large JSON-LD blocks; gzip makes it
   small, so not worth a pass alone.
