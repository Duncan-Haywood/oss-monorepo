# XER Schedule Check page: ten analysis modules load on first press (2026-11-23)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for the
owner, so this run took a visitor-facing item.

## Sweep

`node platform/perf/module-weight.mjs .` on `a346ab082`: shed-designer 355 kB
gzip, ai-bookkeeper 324 kB, then **xer-schedule-check 284 kB over 39 files**.
It was 224 kB in the 2026-11-22 sweep (`ai-bookkeeper-page-perf-2026-11-22.md`):
the venture ships an analysis a day (TIA, collapsed as-built, as-planned vs
as-built, GAO scorecard, drag, crashing), and each landed as one more static
import in `index.html`.

## Reading (before)

`node platform/perf/module-exclusive.mjs ventures/xer-schedule-check/index.html`
(gzip a direct import pulls in that nothing else does):

| module | kB gzip | used by |
|---|---:|---|
| `p6xer.mjs` | 22 | "Download for P6" (MSPDI to XER) |
| `gantt.mjs` (+ actvcodes) | 13 | Gantt card, drawn from several places |
| `tia.mjs` | 13 | time impact analysis card |
| `report.mjs` | 11 | written review; `updateReview()` runs on every load |
| `excel.mjs` | 10 | "Download for Excel" |
| `gao.mjs` | 9 | GAO scorecard card |
| `crash.mjs` | 9 | acceleration card |
| `asplanned.mjs` | 8 | as-planned vs as-built card |
| `lookahead.mjs` | 8 | look-ahead card and the narrative |
| `evmseries.mjs`, `trend.mjs`, `windows.mjs` | 6, 5, 4 | windows analysis (sync `runWindows`) |
| `narrative.mjs`, `drag.mjs` | 5, 5 | narrative print; drag card |
| `milestones.mjs`, `calslack.mjs`, `example-series.mjs` | 3, 2, 1 | their cards / example button |

Throttled load (local static server with gzip, Chromium, 150 ms RTT,
1.6 Mbit/s, CPU 4x slower; time from navigation to the "Load an example
schedule" result showing; 7 runs, median): **2,817 ms**. The local page has no
`modulepreload` links (the Pages build adds them), so this is the worst case.

## Change

`index.html`: the ten modules used only inside one card's button handlers
(`p6xer`, `excel`, `gao`, `crash`, `drag`, `example-series`, `calslack`,
`milestones`, `tia`, `asplanned`) became memoised `import()`s through the same
`onDemand` helper the league page uses (a failed load clears the memo, so the
next press retries). Each handler became `async` and takes its names with
`const { ... } = await xModule()` inside its existing `try`, so a load failure
shows in the card's own status line. The CSV and print buttons load the same
memoised module (already in memory by then, since they unhide only after a run).

Kept static, on purpose: `report.mjs` (`updateReview()` is synchronous and runs
on load and after every analysis), `windows`/`trend`/`evmseries` (inside the
synchronous `runWindows`, whose boolean return drives `record()`), `narrative`
and `lookahead` (the narrative print opens a window, and an `await` before
`window.open` risks the popup blocker), `gantt` (redrawn synchronously from
several controls).

## Verification

- **Same answers.** A Playwright script loaded the old page (copy of `HEAD`'s
  `index.html` beside the modules) and the new one, loaded the example, then
  pressed every converted button: TIA example + run + CSV + exhibit + impacted
  XER; as-planned run + CSV; GAO run + CSV + scorecard; drag run + CSV; crash
  run + CSV; milestone calendars; calendar slack; Excel download; example
  series. Every status line, output panel and downloaded file was identical,
  except the elapsed-milliseconds figure in the drag and crash status lines
  (13 vs 14 ms, 7 vs 6 ms). An MSPDI file written from the example by
  `msproject.mjs` went through "Download for P6" on both pages: the 15,865-byte
  XER and the summary line were identical. No page errors on either.
- **Tests.** `page.test.mjs` now also checks every name a handler takes from an
  on-demand loader is exported by that module, every loader is used, and none
  is still imported statically; `excel.test.mjs`'s static-import assertion
  follows the on-demand form. `python3 platform/ci/run_venture_tests.py
  xer-schedule-check`: 444 tests pass (4.7 s), plus the site page checks.

## After

| | before | after |
|---|---:|---:|
| static graph, gzip | 284 kB | **201 kB** |
| files fetched at load | 39 | **29** |
| throttled time to first result (median of 7) | 2,817 ms | **2,314 ms** (−18%) |

## Not changed, ranked for the next run

1. **`report.mjs` (11 kB) and `gantt.mjs` (13 kB).** Both are reached from
   synchronous functions called in many places. Loading them on the first
   schedule open (not at page load) would need `updateReview` and `drawGantt`
   to tolerate a not-yet-loaded module; doable, but a product change with its
   own tests.
2. **The windows trio (15 kB).** `runWindows` could await the three modules
   before its `try`; the return value feeds `record()` in two callers, which
   would have to await it.
3. **shed-designer (355 kB) and ai-bookkeeper (324 kB)** stay the two largest;
   both had passes on 2026-11-22, see their docs' lists.
4. P063 and P064 remain owner-gated (workflow files).
