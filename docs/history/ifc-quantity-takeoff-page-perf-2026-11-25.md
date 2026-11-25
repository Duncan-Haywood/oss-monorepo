# IFC Quantity Takeoff page: the 3D view, the revision diff and the STEP reader load when needed (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for the
owner.

**This run's first target was a duplicate.** It began on a stale clone
(`48c3836a3`) and lazy-loaded the Shift Roster Builder's seven importers.
PR #18712 had already landed the same change on 2026-11-24, export-name test
included. That only came out at the merge conflict, so the branch was rebuilt
on `main` and the run moved to the next page on the list. Lesson for the next
run: `git fetch --depth=1 origin main` and re-run the sweep on `origin/main`
before choosing; the clone the container starts from can be a day old.

## Sweep (on `main`, `ff28eae73`)

`node platform/perf/module-weight.mjs .`: shed-designer 359 kB gzip,
ai-bookkeeper 297, xer-schedule-check 219, changepoint-detector 212 (all
trimmed or worker-backed by earlier passes), then **ifc-quantity-takeoff
182 kB over 14 files**. Its 2026-11-24 pass (`ifc-takeoff-perf-2026-11-24.md`)
made the takeoff faster but left the page's module graph alone.

## Reading (before)

`node platform/perf/module-exclusive.mjs ventures/ifc-quantity-takeoff/index.html`:

| module | kB gzip | used by |
|---|---:|---|
| `view-mesh.mjs` + `viewer.mjs` | 12 + 6 | the 3D model view, built after a model is read |
| `diff.mjs` | 10 | comparing an earlier revision |
| `step.mjs` | 9 | the page's own takeoff, which runs only when `view-worker.mjs` is missing or fails (the worker imports its own copy) |

None of the four does anything until a visitor picks a file, and most landing
visits never do. The Pages build preloads the whole static graph
(`platform/pages/preload.mjs`), so on the live site these competed with the
page's first round trips.

Throttled load (local gzip static server, Chromium with the cache off, 150 ms
RTT, 1.6 Mbit/s, CPU 4x slower, SwiftShader WebGL; 7 runs, median):
**load event 1,537 ms**, 218.3 kB transferred by then; **"Try the sample
model" to a drawn model: 2,150 ms**.

## Change

`index.html`: three memoised `import()` loaders through the `onDemand` helper
the league, XER and shift-roster pages use (a failed load clears the memo):

- `viewModules` (viewer + view-mesh) starts downloading when `run()` begins
  reading a file, so it arrives while the worker takes the model off.
  `buildView` awaits it before it builds the view. If the download fails, the
  view status says so and the rest of the result still shows.
- `diffModule` starts with the earlier revision's takeoff in `runEarlier`, and
  `earlier` is set only after it resolves. That keeps every synchronous user
  (`renderDiff`, `renderDelta`, `renderChanges`, the two CSV buttons, which
  all return early without `earlier`) on a loaded module. A failed download
  says so in the status line.
- `stepModule` makes `takeoffOnPage` async. Its three callers were already
  inside `async` functions and `try` blocks.

## Verification

- **Same answers.** A Playwright script ran the old page (`HEAD`'s
  `index.html` beside the modules) and the new one in five steps: the sample;
  the sample's next revision; both CSV downloads (delta and changed elements);
  a plan cut; "Compare two revisions". It recorded the status line, the result
  cards, the BoQ, the checks table, the diff cards, the delta table and total,
  the changes table, the view status and the storey list. It ran once with
  workers and once with `Worker` deleted, so the page takes off and meshes
  itself. All 10 states and both downloads were identical, apart from the
  elapsed-seconds figures, which the script masks. No page errors.
  Modules fetched at load fell from 14 to 10.
- **Failure path.** With `viewer.mjs` and `diff.mjs` blocked, the sample still
  showed its result with "No 3D view: the viewer could not be downloaded",
  and the revision compare said the comparison could not be downloaded. Once
  they were unblocked, choosing the files again drew the view and compared.
- **Tests.** `page.test.mjs`: the browser-safety walk now follows `import()`
  too, and a new test checks the four modules are not imported statically, the
  three loaders exist, every name taken from a loader is exported by its
  modules, and every name declared for a loader is assigned from it. A mutation
  (`storeyList` misspelled in the destructure) fails it. `python3
  platform/ci/run_venture_tests.py ifc-quantity-takeoff`: 294 tests pass, plus
  the site page checks.

## After

| | before | after |
|---|---:|---:|
| modules in the static graph | 14 | 10 |
| module weight (`module-weight.mjs`) | 182 kB gzip | 145 kB gzip |
| transferred at load (throttled) | 218.3 kB | 180.8 kB |
| load event, median of 7 (throttled) | 1,537 ms | 1,458 ms |
| sample click to drawn model, median of 7 | 2,150 ms | 2,135 ms |

## Not changed, ranked for the next run

1. **`geom.mjs` + `qto.mjs`, 82 kB gzip, still static.** The page needs
   `boq`, `checkSummary`, `REASON_TEXT` and friends only after a takeoff, and
   the worker already holds its own copy. Moving the page's uses behind a
   loader is the next 40%, but `render()` and a dozen table renderers call them
   synchronously, so it needs the same "set state only after the load" care as
   `diff.mjs` here.
2. **Shift Roster Builder's importer load failure is silent** on `main`: the
   two handlers in PR #18712 have no `.catch`, so a failed `import()` leaves
   the status line unchanged.
3. **sales-agent, 134 kB gzip.** `ai.mjs`/`byok.mjs` (9 kB) and
   `mailfile.mjs`/`mime.mjs` (8 kB) look button-only.
