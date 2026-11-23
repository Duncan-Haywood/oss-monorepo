# Changepoint Detector page: the first press waited 1.3 s for its worker to load (2026-11-23)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for the
owner, so this run took a visitor-facing item.

## Sweep

`node platform/perf/module-weight.mjs .` on `c4e749c19`: shed-designer 355 kB,
ai-bookkeeper 324 kB, xer-schedule-check 201 kB (all three had passes), then
**changepoint-detector 196 kB over 32 files**, with no page pass yet.
`module-exclusive.mjs` showed little to defer: almost every import reaches
`engine.mjs`, which the page needs for its first result in any case.

## Reading (before)

The page runs its analysis in Web Workers (`analyze-worker.mjs` for the main
result, up to `hardwareConcurrency` copies of `consensus-worker.mjs` for the
six-setting "agreed changes" panel). The Pages build lists the page's static
graph as `modulepreload` links (`platform/pages/preload.mjs`; it reports an
import chain 9 deep here), but **a worker has its own module map and gets none of
them**. The live site serves every file `public, max-age=0, must-revalidate`
(`docs/reports/2026-11-07-live-site-measurements.md`), so the first worker
revalidates its whole graph one import level at a time.

Set-up: the built page (`build.mjs --only=changepoint-detector`), served by
`platform/perf/revalidate-serve.mjs` (live-site cache headers and ETags, gzip,
150 ms per request), headless Chromium. Each visit is a fresh context: load,
3 s idle, press "Load example", time until `#results` shows (first result) and
until the agreed panel's text is final; then press again on the same page.
`node eval/first-press-browser.mjs <url> 7`, median of 7:

| | first result | agreed panel done | requests during the first press |
|---|---:|---:|---:|
| first press | **1,355 ms** | **1,887 ms** | 30 (all 304) |
| second press | 92 ms | 226 ms | 1 |

The analysis itself is ~70 ms; the other 1.28 s of the first press is the
revalidation chain. The server log also showed the panel's workers' entry
revalidations running one after another (~150 ms apart): Chromium queues
same-URL requests behind its HTTP cache entry lock, so k new panel workers
cost about k round trips. A worker loads its graph from memory only once
another worker *with the same entry file* has: warming `analyze-worker.mjs`
alone left the panel at 1,629 ms with 48 requests.

## Change

`index.html`:

- `warmMain()`, scheduled with `requestIdleCallback` (timeout 2 s; `setTimeout`
  500 ms where it is missing), creates the main worker if none exists yet.
  `startMain` already reuses `mainWorker` and sets its own `onerror` before
  posting, so a press that came first keeps its own worker. A warm worker that
  fails to load is dropped, and `startMain` makes another or runs the job on
  the page, as before.
- The same call starts one idle `consensus-worker.mjs` (`panelWarm`).
  `runAgreed` and `runColumnPanels` take it as their first worker
  (`takePanelWarm() || new Worker(...)`), so it is not wasted and the rest load
  from memory. If it fails to load it is dropped.

Cost: two idle worker threads per visit (they evaluate the same modules the page's
first press would have loaded), and ~30 conditional requests made while the page
is idle rather than after the press.

## Verification

- **Same answers.** Old and new builds side by side: the Nile example (main
  results + agreed panel), the Proposition 99 synthetic-control example and the
  three-currency several-columns example. `#results` / `#synth-results` /
  `#multi-results`, `#agreed` and `#error` innerHTML identical for all three; no
  page errors on either.
- **Fallback.** With both worker files answering 404, the first press still
  shows the result and the full agreed panel (main-thread fallback), with no
  page errors.
- **Browser checks** in `eval/`: `agreed-worker-browser.mjs` (panel text
  matches Node: true), `analyze-worker-browser.mjs` (worker and no-worker
  summaries match Node), `columns-workers-browser.mjs` (fallbacks give the
  same), all ok.
- **Tests.** `analyze-worker.test.mjs` pins the warm-up: scheduled when idle,
  only when no worker exists, failure drops it, both panels take the warm
  worker, `startMain` replaces the handler before posting.
  `python3 platform/ci/run_venture_tests.py changepoint-detector`: 1,149 tests
  pass (253 s), plus the site page checks.

## After

| | before | after |
|---|---:|---:|
| first press: result shown | 1,355 ms | **98 ms** |
| first press: agreed panel done | 1,887 ms | **870 ms** |
| requests during the first press | 30 | **8** |
| second press: result / panel | 92 / 226 ms | 78 / 173 ms |

Median of 7 each, same set-up. A visitor who presses within the first second
or so of load still waits for part of the chain. The warm-up only moves the
wait earlier.

## Not changed, ranked for the next run

1. **The panel's remaining ~700 ms.** The other k−1 panel workers still
   revalidate their entry and top modules in series (the cache lock). Keeping
   the panel workers alive between runs (a pool that cancels by job id rather
   than `terminate()`) would remove it and the per-run start-up too. That is a
   bigger change to `runAgreed`/`runColumnPanels`'s cancel logic.
2. **Other pages that start module workers on press:** shift-roster-builder
   (`roster-worker.mjs`), league-schedule-generator, school-timetable-builder,
   ifc-quantity-takeoff, ids-model-check, gaussian-process-regression,
   matrix-profile-explorer, drawing-set-index, submittal-register. Each pays the
   same chain on its first press if its worker imports a deep graph. Measure
   each with `revalidate-serve.mjs` before copying the warm-up.
3. **A site-wide fix:** longer `max-age` for hashed module URLs, or flattening
   each worker's graph at build time (the worker entry importing every module
   at depth 1 in parallel). Both change the Pages build and its caching, so they
   need their own measured pass.
4. P063 and P064 remain owner-gated (workflow files).
