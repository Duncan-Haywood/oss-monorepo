# Trade Bid Studio: the 119 trades' rates load on the first pick (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch owner-only `priv-*` workflows. The pool
reading (`ci_profile.py --runs 600`, 17:44 to 18:36 UTC) put the largest
checkout shares in `priv-ci-policy.yml` (89%) and
`priv-conflict-markers-ci.yml` (80%), both owner-only too. So this run took a
visitor-facing page by the north star: `portfolio/monetization/verticals.json`
lists `trade-bid-studio` as a front door for bet #1 (pay-app billing, the
contractor suite), and it had no page pass yet.

## Reading (before)

Gzip `-9` of every file the page loads at start (static imports plus the
`trades.json` fetch):

| file | gzip bytes |
|---|---:|
| presets.mjs (119 trades' rates and line items) | 28,077 |
| index.html | 12,089 |
| trades.json (fetched) | 9,279 |
| proposal.mjs | 7,895 |
| takeoff.mjs | 2,156 |
| engine.mjs | 1,514 |
| usage.mjs | 1,318 |
| quote.mjs | 954 |
| **total** | **63,282** |

`presets.mjs` was 44% of the load. At load the page needs only each trade's
id, slug, name and group (the picker and the directory's "Price it here"
links); the rates and line items matter once a trade is picked.

Throttled load: local static server with gzip and `cache-control: no-store`,
Chromium, 150 ms latency, 1.6 Mbit/s down, CPU 4x slower, service workers
blocked, cache disabled; navigation to `load`; 7 runs, median: **811 ms**
(768 to 847).

## Change

- `build-presets.mjs` also writes `preset-index.mjs`: `GROUPS` and an `INDEX`
  of `{ id, slug, name, group }`, 2,767 bytes gzipped. `presets.mjs` is
  byte-identical; `--check` checks both files.
- `index.html` imports the index. `pickTrade()` loads `presets.mjs` with one
  shared `import()` the first time a trade is picked (by the select, a
  `#trade=` link or a directory link), then calls the unchanged
  `applyTrade()`. A later pick wins over one still loading (a ticket). A
  failed fetch clears the promise, resets the picker and says "The trade
  rates could not load. Check the connection and pick the trade again."
- The fetch starts early when the pointer or focus reaches the picker.

## After

Same reading: 63,282 → **37,972 bytes** gzipped at load (−40%); throttled
load median **645 ms** (637 to 676), −20%.

## Verification

- **Same answers.** A Playwright script ran a copy of `HEAD`'s directory
  and the new one through: load, picking window replacement then duct
  cleaning, editing a line quantity, clearing the trade, a cold
  `#trade=asphalt-sealcoat` link, a directory "Price it here" click, and two
  picks fired back to back on a cold page. Every snapshot (picker, summary,
  specialist link, takeoff rows and sums, price, walk-away, profit,
  margin/markup, overrun, per-unit price, hash, directory HTML) was
  identical; no page errors. The only difference was the request set at load
  (`presets.mjs` → `preset-index.mjs`).
- **Failure path.** With `presets.mjs` answering 503 the pick showed the
  could-not-load line and reset the picker; after recovery, the same pick
  gave $323 / $233 / 65.74%, the same as a cold pick on the old page.
- **Tests.** `presets.test.mjs`: `preset-index.mjs` is current and equals
  `PRESETS` projected to the four fields. `page.test.mjs`: the static import
  is the index, `presets.mjs` only as `import()`, the change and hash
  handlers go through `pickTrade`, and only `applyTrade` reads the full
  presets; reverting the change handler or the `applyTrade` lookup each fails
  it. `python3 platform/ci/run_venture_tests.py trade-bid-studio`: 92 tests,
  0 failed, plus the site page checks.

## Not changed, ranked for the next run

1. `trades.json` (9.3 kB gz) is fetched at load for the directory below the
   fold; it could wait for the directory to near the viewport, but it also
   feeds the search box and the count, so check those first.
2. `proposal.mjs` (7.9 kB gz) is needed only when the proposal section is
   used; same lazy pattern as the pay-app page's `workbook.mjs`.
3. `index.html` (12.1 kB gz) carries the FAQ and the 119-row picker is built
   in script; nothing to cut without changing content.
