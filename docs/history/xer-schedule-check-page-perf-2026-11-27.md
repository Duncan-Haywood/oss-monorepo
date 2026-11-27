# XER Schedule Check page: seven button-only modules load on first press (2026-11-27)

Perf track, version 0, item 4 ("what visitors wait on"). The perf backlog had no
agent-workable item (P063, P064, P086 are owner rows). `transition.py` lists
xer-schedule-check among the for-profit construction products; its page is the
front door.

## Reading (before, `origin/main` `be083c7d2`)

`node platform/perf/module-weight.mjs ventures/xer-schedule-check`: **221 kB gzip,
31 files** in the page's static module graph; the Pages build turns every one
into a `modulepreload` link (32 links including `pf-embed.js`).

`module-exclusive.mjs ventures/xer-schedule-check/index.html` named the modules
only the page imports, and reading their call sites showed seven used only
inside a button's click handler (or a file-input change handler):

| module | kB gzip exclusive | used by |
|---|---:|---|
| `msproject.mjs` (+ `contours.mjs`) | 25 | Download for Microsoft Project (`#conv-xml`) |
| `collapse.mjs` (+ `status.mjs`) | 12 | collapsed as-built (`#cab-*`) |
| `lookahead.mjs` | 8 | look-ahead (`#la-*`) and the narrative |
| `evmseries.mjs` | 6 | windows analysis, earned value by window |
| `trend.mjs` | 5 | windows analysis, health trend |
| `narrative.mjs` | 5 | monthly narrative (`#nar-*`) |
| `windows.mjs` | 4 | windows analysis (`#win-*`) |

Left eager on purpose: `gantt.mjs` (`codeTypes` fills the group-by list on every
file load), `ribbon.mjs` (`ribbonOptions` likewise), `report.mjs` (`updateReview`
runs on every load), `evm.mjs`, `constraints.mjs`, `compare.mjs`, `dcma.mjs`.

## Change

`index.html`: seven more `onDemand(() => import(...))` loaders, the helper the
page already used for fourteen modules. Handlers that used them became `async`
and take the names from the loader; `runWindows` and `buildNarrative` became
async and their callers await them. `#nar-print` now opens its window inside
the click, before the awaited load, so a popup blocker still treats it as the
user's; a failed build closes it and says why in the status line.
`page.test.mjs` already checks that every name taken from a loader is exported
by its module, that every loader is used, and that no lazy module is also
imported statically; it passes with 21 loaders.

## Verification

- `python3 platform/ci/run_venture_tests.py xer-schedule-check`: ok, 628 tests,
  plus the site page checks.
- Click-through in Chromium (Playwright) on the built page, old and new
  (old copy served beside the new as `index-a.html`): example pair, Microsoft
  Project download, collapsed as-built example + run + CSV, look-ahead run + CSV
  + print, narrative HTML + text + print, example series windows + three CSVs.
  Both pages produced the same nine downloads with the same names, the same
  status lines, the same earned-value and trend HTML lengths (3,188 and 10,645
  chars), one print popup, and no page errors (one console line in both: the
  analytics host, blocked by the sandbox proxy).

## After

| reading | before | after |
|---|---:|---|
| static module graph (`module-weight.mjs`) | 221 kB gz, 31 files | 155 kB gz, 22 files |
| modulepreload links in the built page | 32 | 23 |
| `page-bench.mjs --runs=9` (CPU 4x, 60 ms/request), DOMContentLoaded median | 563 ms, 37 requests, 315 kB | 508 ms, 28 requests, 246 kB |
| `page-bench.mjs --runs=7 --delay=0 --latency=150 --down=1600`, interleaved A/B, DOMContentLoaded median | 1,941 ms | 1,556 ms |

The first `page-bench` rows were two separate runs back to back on
`/tmp` builds (`build.mjs --only=xer-schedule-check`); the slow-network rows
were one interleaved run (old page as `index-a.html` in the new build).

## Not changed, ranked for the next run

1. `gantt.mjs` (11 kB): only `codeTypes` runs on load. Moving `codeTypes` to a
   small module (or making `fillGroupBy` async) would let the chart itself load
   on its button.
2. `report.mjs` (11 kB): `updateReview` calls `reviewItems`/`windowsFor` on
   every load to print the correction count; splitting those from `reviewHtml`
   would defer the HTML writer.
3. `evm.mjs` (11 kB) and `constraints.mjs` (9 kB): check their load-time callers
   the same way.
4. `index.html` itself is 219 kB raw (FAQ and notes text); compressed it is the
   largest single request. Not a code lever.
