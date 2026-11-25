# Pay Application Generator: the .xlsx reader and writer load on first use (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch owner-only workflow files and wait for the owner. The
heavy venture pages in `module-weight.mjs` (shed-designer, ai-bookkeeper, XER,
changepoint, IFC, wall-framing, shift-roster) have all had passes in the last
four days, so this run picked by the north star instead: the free G702/G703
page is the front door named for bet #1, pay-app billing
(`portfolio/monetization/bets.md`).

## Reading (before)

A scratch walker over static `import ... from "./x"` edges, gzip per file
(same idea as `platform/perf/module-weight.mjs`):

| file | gzip bytes |
|---|---:|
| index.html | 9,709 |
| sheet.mjs (.xlsx reader) | 7,653 |
| calc.mjs | 6,365 |
| workbook.mjs (.xlsx writer) | 6,288 |
| usage.mjs | 946 |
| **total, 5 files** | **30,961** |

`sheet.mjs` and `workbook.mjs` are 45% of what the page loads, and a first
visit uses neither: `sheet.mjs` matters only when an .xlsx is chosen or a
pasted table has a title block above its header (the header search), and
`workbook.mjs` only when "Download as Excel" or "Download the blank template"
is pressed.

Throttled load: local static server with gzip and `cache-control: no-store`,
Chromium, 150 ms latency, 1.6 Mbit/s down, CPU 4x slower, service workers
blocked; time from navigation to `load`; 7 runs, median. Same conditions as
the wall-framing, babysitting and XER passes.

## Change

`index.html` only:

- The two static imports became `import()` calls behind `lazy()`, one shared
  promise per module; a failed fetch clears the promise so the next press
  retries, and the page says "Part of the page could not load (...). Check
  the connection and try again." in the status line.
- `run()` stays synchronous. On the header-search branch, when `sheet.mjs` is
  not loaded yet, it returns `null` before touching the page; the Work out
  handler loads the module and runs again. `retainageChecks` is reached only
  when `imported` is set, which needs `sheet.mjs` already loaded.
- The .xlsx import awaits `sheet.mjs` before reading the file; choosing an
  .xlsx in the file input starts the fetch early.
- The two download buttons await `workbook.mjs`, then download as before. It
  is warmed in the background as soon as a result is shown, and when the
  pointer or focus reaches the template button, so the press normally finds
  it loaded.

`pay-application-template.html` keeps its static import: downloading the
template is that page's whole job.

## Verification

- **Same answers.** A Playwright script ran the old page (a copy of `HEAD`'s
  directory) and the new one through: the worked example, both Excel
  downloads, a pasted table with a title block (the header search, cold:
  `sheet.mjs` not yet loaded), a pasted table with no usable columns, an
  import of `fixtures/libreoffice-g703.xlsx`, and a rerun. Every status line,
  summary, findings list, table, import note and both downloaded files
  (sha256) were identical; the only difference was the request set at load
  (`calc, index, sheet, usage, workbook` → `calc, index, usage`). No page
  errors.
- **Cold and failure paths.** With both modules answering 503: the template
  button (synthetic click, so no hover warm-up), an .xlsx import and the
  header search each showed the could-not-load line. After the server
  recovered, the template downloaded byte-identical to the warm run and the
  import worked.
- **Tests.** `page.test.mjs`: the static-import list is now `calc` and
  `usage`, the dynamic list `sheet` and `workbook`, and a new test checks
  every call to the four reader functions goes through `sheet.` and every
  `workbookXlsx` call through the loaded module (each of three mutations that
  drops the prefix fails it), plus the `return null` / reload handshake and
  the memo clear. `python3 platform/ci/run_venture_tests.py
  pay-application-generator`: 65 tests, 0 failed, plus the site page checks.

## After

| | before | after |
|---|---:|---:|
| static graph, gzip | 30,961 B, 5 files | **17,530 B, 3 files** (−43%; index.html grew 510 B with the loader) |
| bytes on the wire at load (CDP, gzip) | 32,074 | **18,195** (−43%) |
| throttled time to `load` (median of 7) | 540 ms | **459 ms** (−15%) |

Runs: before 522, 523, 532, 540, 546, 548, 579; after 434, 452, 457, 459,
461, 461, 464. The harness (`timing.mjs`), the equivalence script (`eq.mjs`)
and the cold/failure script were scratch files; their method is above.

## Not changed, ranked for the next run

1. **`index.html` itself is 9.7 kB gzip**, a third of it the FAQ JSON-LD,
   which search engines need in the HTML. Leave it.
2. **The other construction front doors are already small**: retainage
   cash flow 19 kB, mechanics lien 20 kB, contractor WIP 13 kB. No pass
   needed.
3. **einvoice-preflight (28 kB, bet #3)** loads `paddle.mjs` (4 kB) eagerly
   for a checkout most visitors never open; small, but the same pattern.
4. P063 and P064 remain owner-gated.
