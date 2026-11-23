# Babysitting Business Kit: nine tab modules load on the tab's first open (2026-11-23)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for
the owner, so this run took a visitor-facing item.

## Sweep

`node platform/perf/module-weight.mjs .` on `9d52beb45`: shed-designer 355 kB
gzip and ai-bookkeeper 324 kB (both had passes on 2026-11-22), then
**babysitting-business-kit 240 kB over 35 files**, the largest page nobody
had worked on. xer-schedule-check dropped to 201 kB after this morning's pass
(`xer-schedule-check-page-perf-2026-11-23.md`).

## Reading (before)

`node platform/perf/module-exclusive.mjs ventures/babysitting-business-kit/index.html`
(gzip each direct import pulls in that nothing else does):

| module | kB gzip | draws into |
|---|---:|---|
| `content-ui.mjs` (+ byok, content) | 24 | Posts & blog tab |
| `activities-ui.mjs` (+ activities) | 23 | Activities tab |
| `packages-ui.mjs` (+ packages) | 18 | Packages tab |
| `sitreport-ui.mjs` (+ sitreport) | 14 | Families tab (`#sitReports`) |
| `agreements-ui.mjs` (+ agreements) | 13 | Agreements tab |
| `insights-ui.mjs` (+ insights) | 12 | Insights tab |
| `invoices-ui.mjs` (+ invoices) | 11 | Invoices tab |
| `safety-ui.mjs` (+ safety) | 11 | Safety tab |
| `network-ui.mjs` (+ network) | 10 | Network tab |
| `intake`, `references`, `taxes`, `credentials-ui`, `waitlist-ui`, ... | 12, 8, 8, 7, 5 | Today, Leads, Money, Settings, Waitlist |

The page is 19 tabs and opens on Today. All 19 tabs' code loaded and mounted
before the page was usable.

Throttled load (local static server with gzip, Chromium, 150 ms RTT,
1.6 Mbit/s down, CPU 4x slower, service workers blocked, no `modulepreload`
links; time from navigation to the `load` event, which fires after the module
script has run and mounted every tab; 7 runs, median): **2,207 ms**, 36
requests. Script: a 40-line Playwright harness, the same conditions as the XER
pass.

## Change

`index.html`: the nine modules above that draw only inside their own tab moved
out of the static imports into a `LAZY_TABS` table (tab, container id,
`import()`, mount). `show(tab)`, the one function every tab change goes through
(click, arrow keys, the Book button, Load example), calls `openLazyTab(tab)`,
which imports and mounts the tab's module once. A mount whose render the page's
`render()` calls (sit reports, agreements, network, safety, packages) is drawn
straight after mounting, as the eager mount was drawn by `render()` at load;
until then the page's `render()` calls the existing no-op placeholders. A failed
fetch writes a one-line message in the tab and clears the memo, so the next
open retries.

Kept static, on purpose: `automations-ui` and `credentials-ui` (they draw into
the Today panel and Settings), `waitlist-ui` (it draws into the Schedule tab's
week grid), `intake`, `references`, `taxes`, `slots`, `print`, `site` (used by
`render()` itself).

The service worker needs no change: its import crawler already follows
`import("./x.mjs")`, so an installed app still opens every tab offline (the e2e
"installed ... opens offline" test passes).

## Verification

- **Same answers.** A Playwright script (fixed clock and `Math.random`) loaded
  the old page (a copy of `HEAD`'s directory) and the new one, pressed "Load
  example", then opened all 19 tabs and saved each panel's `innerHTML` and the
  stored desk. Two orders: cold (example first), and every tab visited once
  before the example. All 19 panels and the stored desk were byte-identical in
  both orders.
- **Failure path.** With `invoices-ui.mjs` answering 503, the Invoices tab
  showed "This tab could not load (...)"; after the server recovered, the next
  open mounted the tab and removed the message.
- **Tests.** `page.test.mjs` gained "tab-only modules load on demand and mount
  what they export": nine rows, each tab and container exist, the container
  sits in that tab's panel, nothing imports the module statically, and every
  `m.mountX(` the row calls is an export of the module. The wiring assertions
  in `network.test.mjs`, `safety.test.mjs` and `sitreport.test.mjs` now match
  the on-demand row instead of the static import. `python3
  platform/ci/run_venture_tests.py babysitting-business-kit`: 334 tests pass
  (3.5 s), plus the site page checks; `e2e.test.mjs` 7 of 7 in Chromium.

## After

| | before | after |
|---|---:|---:|
| static graph, gzip | 240 kB | **103 kB** |
| files fetched at load | 36 | **17** |
| throttled time to `load` (median of 7) | 2,207 ms | **1,279 ms** (−42%) |

Runs: before 2171, 2200, 2206, 2207, 2215, 2254, 2552; after 1253, 1264, 1274,
1279, 1282, 1289, 1308.

## Not changed, ranked for the next run

1. **wall-framing-takeoff (238 kB, 35 files)** is now the third-heaviest page
   and has had no page-weight pass; `stairs.mjs` (20 kB) and `roof.mjs`
   (16 kB) look tab-shaped.
2. **changepoint-detector (196 kB)**: `watch-core` and `presteps` (42 kB
   together) are worth a `module-exclusive` reading.
3. Here, `intake.mjs` (12 kB) is the largest module left at load; it is used
   by the Leads tab and by `render()`'s Today list, so it stays.
4. P063 and P064 remain owner-gated (workflow files).
