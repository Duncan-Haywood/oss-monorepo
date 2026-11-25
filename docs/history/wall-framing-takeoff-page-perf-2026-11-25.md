# Wall Framing Takeoff page: the DXF reader and the schedule solver load on use (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items are still owner-gated: P064 edits `priv-portfolio-pages.yml`, and P063 is
blocked until the unwired checks move to their own full-tree job (its 2026-11-25
history line). So this run took item 2 of the "not changed" list in
`ci-perf-2026-11-22-einvoice-explainers-on-demand.md`: `wall-framing-takeoff`,
the free front door to bet #6 (residential takeoff, `portfolio/monetization/bets.md`)
and a construction product, the owner's favourite vertical.

## Reading (before, `88c95d249`)

- `node platform/perf/module-exclusive.mjs ventures/wall-framing-takeoff/index.html`:
  **102 kB gzip, 18 module files**, plus the page's own HTML (221 kB raw,
  58 kB gzip). The largest modules: `engine.mjs` 26k, `dxf.mjs` 15k,
  `budget.mjs` 14k, `schedule.mjs` 10k.
- `dxf.mjs` showed 0k "exclusive" because two roots imported it: the page
  (for the plan-file picker) and `sketch.mjs` (for `planFromSketch`).
- Throttled load (bench below), median of 7, `domContentLoadedEventEnd`:
  **1,683 ms** and 1,619 ms in two sets, 19 files, 162 kB on the wire.

## What moved, and what stayed

Each import was traced to its call sites (`grep -nw` over the inline module):

| module | used in | moved? |
|---|---|---|
| `dxf.mjs` (46 kB raw) | plan-file picker for `.dxf`/`.ifc`, IFC storey change: both already `async` | yes |
| `planFromSketch` (pulls `dxf.mjs`) | "Use this sketch" click | yes, into new `sketchplan.mjs` |
| `schedule.mjs` (33 kB raw) | "Load example" and "Find the critical path" clicks | yes |
| `budget`, `levelBids`, `sensitivity`, `budgetDiff` | `renderBudget()` and the cards it redraws on every run | no |
| `sketch.mjs` (rest) | restores the stored sketch and draws it at start-up | no |
| `panels.mjs` | `panelMaxIn()` runs synchronously inside several handlers | no (6k; see below) |
| `bidpackage`, `bidletter` | print/download buttons open a window; an `await` first risks the popup blocker | no |

`sketch.mjs` no longer imports `dxf.mjs`: `planFromSketch` moved, unchanged, to
`sketchplan.mjs`, which imports `sketchToDxf` from `sketch.mjs` and `planFromDxf`
from `dxf.mjs`. The three tests that call it (`sketch.test.mjs`,
`sketch-fuzz.test.mjs`, `hostile-entrypoints.test.mjs`) import it from there.
The page loads all three through its existing `lib()` helper, which already
served the PDF, drawings and opening-schedule downloads; a failed fetch says
"Could not load ... try again" in the status line and the handler returns.

## After

- module graph: **76 kB gzip, 16 files** (−26 kB, −25%).
- throttled load, median of 7: **1,558 ms** and 1,533 ms (−125 ms and −86 ms
  against the two before sets; −5 to −7%), 17 files, **136 kB** on the wire.
  The gain is modest because `engine.mjs` and `budget.mjs` run on the first
  screen and the HTML itself is 58 kB gzip.

## Verification

- **Same answers.** `equiv.cjs` (below) loaded the before copy and the new page
  side by side and drove: open `fixtures/open-house-plans-2.dxf` (and `-1.dxf`
  in a second run), run the takeoff, load the schedule example, run it, and
  "Use this sketch" on a seeded 4-wall sketch with a door. `#status`,
  `#schedIn`, `#schedOut`, `#skInfo` and the full `innerText` length were
  identical on both; no page errors on either.
- **Tests.** `python3 platform/ci/run_venture_tests.py wall-framing-takeoff`:
  1,217 tests pass (1 skipped, the native-binary build). A new `page.test.mjs`
  test pins that `dxf.mjs`, `schedule.mjs` and `sketchplan.mjs` are not static
  imports, that `sketch.mjs` does not import `dxf.mjs`, that each is loaded with
  `lib()`, and that each exports the functions the page reads. The pinned
  static import list and the two schedule-card tests were updated to the new
  shape (same assertions on the wiring, not weakened).
- **Types.** `node platform/pages/typecheck.mjs wall-framing-takeoff`: 61
  opted-in files, 0 diagnostics (`sketchplan.mjs` is `@ts-check`).

## Bench scripts

`load.cjs <abs dir> <runs> [page]`: a local gzip server, every other host
aborted, CDP `Network.emulateNetworkConditions` (150 ms, 1.6 Mbit/s down),
`Emulation.setCPUThrottlingRate` 4, cache disabled, a fresh context per run,
reading `performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd`
(the method of `shift-roster-page-perf-2026-11-24.md`). Pass an absolute
directory: the server's path guard refuses a relative one and the page then
loads with no modules (a first "after" reading of 197 ms was that, not a win).
`equiv.cjs` serves both folders without gzip and runs the scenario above.
Neither is in the tree; the descriptions are enough to rebuild them.

## Not changed, ranked for the next run

1. `panels.mjs` (6k): only `panelMaxError` is needed synchronously
   (`panelMaxIn()`); splitting that one check into its own module would let
   `panelOrder` and friends load on the shop-panel button. Small.
2. `index.html` itself is 58 kB gzip: the FAQ JSON-LD and the long card markup.
   That is SEO and first-screen content, so trimming it is a product call.
3. The other heavy app pages from the 2026-11-22 list: `shed-designer`
   (470 kB), `league-schedule-generator` (245 to 319 kB per page),
   `babysitting-business-kit` (297 kB). Same method: trace each import to its
   call site before moving it.
