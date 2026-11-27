# Module workers: the Pages build lists each worker's graph at depth 1 (2026-11-27)

Perf track, version 0, item 4 ("what visitors wait on"). No `perf:` backlog
item was agent-workable (P063, P064, P086 are owner rows). Before choosing this,
I timed `ai-bookkeeper`'s suite file by file
(`suite_file_times.py ai-bookkeeper --jobs 4`): 351 files, 119.8 s summed, 31.7 s
wall, slowest 3.7 s (`fuzz.test.mjs`), so no outlier worth a pass. Item 3 of
the "not changed" list in `changepoint-detector-page-perf-2026-11-23.md` named
this change ("flattening each worker's graph at build time"), and its item 2
listed the pages that start module workers on a press. The fix lands in the
build, so it covers all of them at once, including league-schedule-generator
and shift-roster-builder (for-profit rows 11 and 8 in `transition.py`),
ifc-quantity-takeoff and ids-model-check.

## The problem

The build adds `<link rel="modulepreload">` for a page's static graph
(`platform/pages/preload.mjs`). A Web Worker has its own module map, so those
links do nothing for it. `new Worker("./x-worker.mjs", { type: "module" })`
fetches the entry, parses it, fetches its imports, parses those, and so on:
one round trip per import level. On the live site every file is served
`max-age=0, must-revalidate`, so a repeat visitor pays the same chain as 304s.
league-schedule-generator's `bowling-worker.mjs` is six levels deep
(`bowling.mjs → outputs.mjs → brackets.mjs → standings.mjs → race-exact.mjs`).

## Change

`preload.mjs` gains `flattenWorkerGraphs`, which `build.mjs` runs right after
`addModulePreloads` and before the offline layer:

1. Every built `.html`, `.mjs` and `.js` file is scanned for
   `new Worker(...)` / `new SharedWorker(...)` with a literal `.mjs`/`.js` URL
   (plain, `new URL("...", import.meta.url)`, or `new URL("x.mjs", location.href)`)
   **and** `type: "module"` in its options. Classic workers, Node
   `worker_threads` (`workerData`, `execArgv`, no `type`) and Cloudflare
   Workers never match.
2. For each entry whose graph is at least 3 levels deep, the built copy gets one
   line `import "./dep.mjs";` for each module in its static graph that it does
   not import already, after a marker comment, at the end of the file.
   The browser asks for all of a module's imports at once, so the graph arrives
   in two rounds.
3. **Evaluation order is unchanged.** Imports evaluate depth-first in the order
   they are written. The entry's own imports come first and already reach
   every module listed, so when the appended lines are reached each module has
   already run and they do nothing. The new test runs both versions in Node,
   with modules that log their evaluation, including a cycle, and checks the
   two logs are equal.
4. Because an appended import *evaluates* a module, the graph for this pass is
   read with `strictStaticImports`. That reader strips comments and accepts
   only statements that start a line or follow a `;`, so a specifier in a
   comment or a string is never added. (The preload pass's looser reader is
   fine there, since a stray preload only fetches a file.) Missing an import is
   harmless: one level of the waterfall stays.

Sources in `ventures/` are untouched. Only the built site changes.

## Verification

- **Same graph, checked with a real parser.** In a full build, all 14
  flattened workers were re-parsed with acorn (`/opt/node-tools`). In each, the
  appended set equals the acorn-reachable graph minus the entry and its direct
  imports (14 of 14, 110 imports, 0 mismatches). The original text is a prefix
  of each flattened file.
- **Builds compared** (`build.mjs --only=league-schedule-generator,shift-roster-builder,changepoint-detector`):
  `diff -rq` between before and after lists only the 9 worker entries, `sw.js`
  (its cache name hashes the files) and `version.json`. Page preloads are
  unchanged: 191 links on 17 pages in both.
- **The workers still give the same answers in Chromium**, run with the
  venture's own eval scripts against the flattened files:
  changepoint `eval/analyze-worker-browser.mjs` (worker summary matches Node,
  stale-run and no-worker fallbacks ok) and `eval/agreed-worker-browser.mjs`
  (panel text matches Node: true); league `eval/browser-race-worker.mjs`
  (4 ok), `eval/browser-bowling.mjs` (19 checks pass, 0 fail) and
  `eval/browser-carryover-pool.mjs` (every core count gives the same season).
  The league scripts ran with the source HTML, because their small server
  crashes on the built pages' site-chrome requests (an `ERR_HTTP_HEADERS_SENT`
  in the eval server, not in the page).
- `node --test platform/pages/preload.test.mjs`: 10 pass (3 new).
- Full build: `Module workers flattened: 14 (110 import(s) added; deepest 10).`
  The build took no measurable extra time (the pass reads each built JS file once).

## Before and after

Set-up: `platform/perf/revalidate-serve.mjs` (live-site headers and ETags,
gzip, 150 ms per request) serving each build. In headless Chromium, a fresh
context opens a blank page and runs `new Worker(<entry>, { type: "module" })`.
The time is from that call to the last module request answered (server log
plus 150 ms). "Warm" is the same context after a reload, when every request is
a 304. Median of 5. The figure includes about 170 ms of worker start-up and
harness overhead in both columns.

| worker | requests | cold before | cold after | warm before | warm after |
|---|---:|---:|---:|---:|---:|
| league `bowling-worker.mjs` | 15 | 1,089 ms | **777 ms** | 1,080 | **767** |
| league `practice-worker.mjs` | 9 | 1,085 | **621** | 1,080 | **614** |
| league `suggest-worker.mjs` | 12 | 939 | **627** | 927 | **618** |
| league `round-check-worker.mjs` | 11 | 930 | **624** | 931 | **620** |
| league `carryover-worker.mjs` | 6 | 782 | **473** | 775 | **465** |
| league `race-worker.mjs` | 6 | 622 | **470** | 618 | **464** |
| changepoint `analyze-worker.mjs` | 26 | 1,248 | **1,074** | 1,238 | **1,070** |
| changepoint `consensus-worker.mjs` | 17 | 1,082 | **779** | 1,079 | **769** |
| shift-roster `roster-worker.mjs` | 3 | 647 | **481** | 633 | **464** |

The request counts are unchanged: the same files, fetched sooner. The test
server speaks HTTP/1.1, so Chromium opens at most six connections, and a
graph of 15 or 26 modules still takes three or five rounds there. Cloudflare
serves the live site over HTTP/2, where one round should fetch the whole
graph, so the live gain on the large graphs should be bigger than this table
shows. That is untested here. Changepoint's page already warms its two
workers on idle (2026-11-23), so for that page this mostly shortens the warm-up.

## Not changed, ranked for the next run

1. **The six-connection ceiling in the bench.** An HTTP/2 local server (Node
   `http2.createSecureServer` with a throwaway certificate) would measure
   the live site's shape. `revalidate-serve.mjs` is HTTP/1.1 only.
2. **Workers created from a variable URL** (`new Worker(workerUrl, ...)`) are not
   detected. None in the current build is a browser module worker with a deep
   graph; the 14 found cover every `*worker*` browser module in `dist/`.
3. **Dynamic `import()` inside workers** stays on demand, on purpose, so a worker
   that lazily imports a deep graph still pays that chain at the time of use.
4. **Longer `max-age` for hashed module URLs** (the other half of item 3 in the
   2026-11-23 note) would remove the warm revalidations altogether. It
   changes the deploy's caching, so it needs its own pass.
5. P063, P064 and P086 remain owner-gated.
