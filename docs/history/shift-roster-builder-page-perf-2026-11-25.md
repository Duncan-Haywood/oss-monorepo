# shift-roster-builder: the staff and schedule importers load on first use (2026-11-25)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). Both
open perf backlog items (P063, P064) touch workflow files in
`.github/CODEOWNERS` and wait for the owner. The roster builder is one of the
eight subscription products in `portfolio/monetization/LICENSING_TRANSITION.md`
and none of its pages had a page-weight pass yet, so its free page (the lead
magnet for the paid edition) was the target.

## Reading (before, `ee4ef9970`)

`node platform/perf/module-exclusive.mjs ventures/shift-roster-builder/<page>`:

| page | static graph, gzip |
|---|---:|
| `index.html` | **178 kB, 13 files** |
| `shifts-from-sales.html` | 160 kB, 5 files |
| `availability.html` | 128 kB, 2 files |

On `index.html`, `calc.mjs` + `bnp.mjs` (the solver, ~128 kB) are the page's
engine. The next block was seven file importers: `import-staff`,
`import-shifts`, `import-7shifts`, `import-wheniwork`, `import-square`,
`import-deputy`, `import-deputy-staff` (46,524 bytes gzip -9 together). The
page calls them only inside the two file-input `change` handlers
(`#import-file`, `#import-shifts-file`) and the two pickers that re-read a
chosen schedule file. A visitor who types or pastes their staff, or picks a
template (most visitors), downloaded, parsed and evaluated all seven first.

## Change

`index.html`: the seven static imports became one memoised loader,
`importers()`, which `import()`s all seven the first time a file is chosen and
merges their exports. A failed load clears the memo (so choosing the file again
retries) and says so in the form status line.

- Staff import: the handler awaits the loader alongside the file reads, then
  runs the same code.
- Schedule import: `runShiftsImport` is now `async`; it awaits the loader and
  returns early if a newer file replaced the one it was started for, so a slow
  first load cannot overwrite a later choice. The file handler awaits it before
  filling the location and shift-family pickers.
- The importers are loaded as one group: `import-deputy-staff` pulls in
  `import-deputy`, which pulls in `import-shifts` and `import-wheniwork`, so a
  split by input type would save little and add branches.
- `staffpack.mjs` (2.7 kB) stays static: its button calls `window.open`, and
  an `await` before that risks a popup blocker for a 2.7 kB saving (the same
  call the league page made for `printpack.mjs`).

The Pages build's module preloads (`platform/pages/preload.mjs`) list static
imports only, so the built page no longer preloads the importers either.

## After

Same tool: **133 kB gzip, 6 files** (−45 kB, −25%; 13 → 6 module requests on
load).

## Verification

- Playwright (chromium, local static server), old page against new, same steps:
  load; import a staff CSV with a Location column; import a three-row schedule
  CSV over two locations; pick one location; import saved 7shifts shifts, roles
  and locations JSON together; import a JSON staff file. After each step the
  staff box, shifts box, status line, picker visibility and picker options were
  compared: **identical at all five steps**. Old page requested all seven
  importers on load; new page requested none on load and all seven after the
  first file. No console or page errors on either.
- `page.test.mjs`: the static-import list drops the seven modules; a new
  assertion pins them as `import()`; a new test checks that each of the twelve
  names the script destructures from the loader is a function exported by one
  of the seven. 26/26 pass (was 25; the inline-script parse check still passes,
  as every `await` sits inside an async function).
- Full suite: `python3 platform/ci/run_venture_tests.py shift-roster-builder`
  (result in the run record's notes).

## Not changed, ranked for the next run

1. **`shifts-from-sales.html` (160 kB).** `demand.mjs` (84 kB raw) imports
   `calc.mjs` whole and `import-staff.mjs` for its CSV splitter; a check of
   which `calc.mjs` functions `demand.mjs` calls would say whether a smaller
   shared module is worth a product change.
2. **`calc.mjs` (394 kB raw, the bulk of every page here).** One file holds the
   solver, the exports (CSV, ICS, messages) and the report text; the export
   writers are click paths. Splitting means a product change inside `calc.mjs`
   with its own pinning tests (`calc.test.mjs` is 115 kB).
3. **The guide pages** (`how-to-*.html`, `*-staff-schedule.html`) import
   nothing; no change needed.
4. P063 and P064 remain owner-gated (workflow files).
