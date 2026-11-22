# league-schedule-generator: team duties and TRF files load on first use (2026-11-22)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). Both
open perf backlog items (P063, P064) touch workflow files in
`.github/CODEOWNERS` and wait for the owner. Item 2 of the "not changed" list in
`ai-bookkeeper-page-perf-2026-11-22.md` named this page: 258 kB gzip of
eager modules, with `carryover.mjs` and `divisions.mjs` looking like option
paths. A per-file timing of `sales-agent` (9.2 s over 45 files, none above
0.9 s) found nothing worth a change on the CI side.

## Reading (before, `390031e73`)

`node platform/perf/module-exclusive.mjs ventures/league-schedule-generator/index.html`:

| direct import | gzip it alone pulls in |
|---|---:|
| `divisions.mjs` | 40 kB |
| `trf.mjs` | 4 kB |
| `printpack.mjs` | 2 kB |
| `licence.mjs`, `usage.mjs` | 1 kB each |
| `calc.mjs`, `carryover.mjs` | 0 (each shares its graph with the other) |

Total static graph: **258 kB gzip, 18 files**. `divisions.mjs` is the
multi-division engine (139,137 bytes raw). The single-league page uses six of
its functions, all behind one card: the team-duty box (`#duties`) and the
"team sheets" / "team duties" downloads. `trf.mjs` (9,945 bytes raw) is the
Swiss card's TRF file reader and writer. A visitor who never opens either
still downloaded, parsed and evaluated both before the first button worked.
`carryover.mjs` is imported by `calc.mjs` itself, so it stays.

## Change

`index.html`: the two static imports became `import()` through a small
memoising `onDemand` helper (a failed load clears the memo so a retry works).

- `showDutyLine` returns at once, with the same empty line and hidden button,
  when there is no schedule or the duty box is blank or whitespace only. Those
  inputs parse to no duties and no errors (`parseDivisionDuties("  \n ")`
  checked), which is what the old code showed. So building a schedule no
  longer loads `divisions.mjs`; typing a duty line does.
- `teamDuties` takes the module's exports as an argument; the two download
  handlers await the module first and then compute, so they read the current
  `last` and box contents, as before.
- The TRF file-input and download handlers await `trf.mjs`.
- `printpack.mjs` (2 kB) stays static: its handler calls `window.open`, and an
  `await` before that risks a popup blocker for a 2 kB saving.

The Pages build's module preloads (`platform/pages/preload.mjs`) list only
static imports, so the built page no longer preloads either file.

## After

Same tool: **214 kB gzip, 16 files** (−44 kB, −17%). `divisions.mjs` is now
fetched only after a duty line is typed, `trf.mjs` only when a TRF file is
opened or downloaded.

## Verification

- A Playwright script (chromium, local static server) ran the same steps on the
  old and new page: load, build a six-team schedule, type two duty lines, take
  both downloads, blank the box, type an invalid line, open the FIDE C5 example
  TRF from `trf.test.mjs`, download the TRF. Old page: both modules requested on
  load. New page: neither on load nor after the build; `divisions.mjs` after the
  duty line, `trf.mjs` after the file. Duty line text, error text, blank-box
  state and TRF message identical; `team-sheets.html` (7,572 bytes),
  `team-duties.txt` (407 bytes) and `swiss-event.trf` (699 bytes) are
  byte-identical (`cmp`). No console or page errors on either.
- `page.test.mjs`: the static-import list drops the two modules; a new
  assertion pins them as `import()` and not static; the duty-box test now pins
  the on-demand shape; a new test checks every name the script takes from an
  on-demand module is exported by it. 62/62 pass.
- Full suite: `python3 platform/ci/run_venture_tests.py league-schedule-generator`
  (result in the run record's `notes`).

## Not changed, ranked for the next run

1. **shed-designer (384 kB gzip, 55 files).** Still the largest venture page
   graph; run `module-exclusive.mjs` on its entry's own imports first.
2. **league-schedule-generator's other pages.** `multi-division-league-schedule.html`
   needs `divisions.mjs` up front (it is the page's engine). The guide pages
   that embed a small tool each import `calc.mjs` (67 kB gzip) whole; a
   per-page check of which functions they call would say whether a smaller
   entry is worth it.
3. **`calc.mjs` + `carryover.mjs` on this page (most of the 214 kB).** The
   carry-over search is reached through `calc.mjs`'s own import, so splitting
   it means a product change inside `calc.mjs`, with its own pinning tests.
4. P063 and P064 remain owner-gated (workflow files).
