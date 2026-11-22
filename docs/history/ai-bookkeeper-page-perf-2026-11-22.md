# AI Bookkeeper page: three modules load on first use (2026-11-22)

Perf track, version 0. Item 1 of the "not changed" list in
`ci-perf-2026-11-20-einvoice-page-engine-on-demand.md`: sweep every venture
`index.html` for a static module graph over ~200 kB gzip, and fix only where
the page's buttons would otherwise wait for code they do not need.

Both open perf backlog items (P063, P064) touch workflow files in
`.github/CODEOWNERS` and wait for the owner, so this run took a visitor-facing
item instead.

## Sweep

`node platform/perf/module-weight.mjs .` (new, committed in this PR): for each
`ventures/*/index.html`, walk the static `import` graph of its module scripts
and sum per-file gzip. 1,398 pages have a module graph; 6 were over 200 kB:

| page | gzip | files |
|---|---:|---:|
| ai-bookkeeper | 397 kB | 53 |
| shed-designer | 384 kB | 55 |
| league-schedule-generator | 258 kB | 18 |
| babysitting-business-kit | 240 kB | 35 |
| wall-framing-takeoff | 238 kB | 35 |
| xer-schedule-check | 224 kB | 32 |

The Pages build already adds `<link rel="modulepreload">` for the whole static
graph (`platform/pages/preload.mjs`), so there is no request waterfall left to
flatten. What remains is bytes and parse time before the first render.

## What the bookkeeper's first render does not need

`node platform/perf/module-exclusive.mjs ventures/ai-bookkeeper/index.html`
lists, for each direct import, the gzip bytes only that import pulls in (what
an `import()` would save):

| import | exclusive gzip | used |
|---|---:|---|
| `receipts.mjs` (+ `cleanocr.mjs`) | 46 kB | on render only when receipts are on file; the Read button |
| `payouts.mjs` | 17 kB | the Plan and Post payout buttons only |
| `annualized.mjs` (+ `penalty2210.mjs`) | 9 kB | the annualized-installment button only |
| everything else | 7 kB or less each | |

Most of the rest (engine, categorize, brands, bank, tax forms, payroll) is
shared with the engine the first render needs, so splitting it saves nothing.

## Change

`ventures/ai-bookkeeper/index.html`: the three imports above become
`import()` at their call sites. `renderReceipts` keeps its synchronous
early return when no receipts are on file; when some are, it starts the import
and renders the card when it arrives. The service worker list is unchanged
(its test already walks `import("./x.mjs")`), so the app still works offline.
`page.test.mjs` now pins the dynamic import of `annualized.mjs` instead of the
static one, and a new test fails if any of the three becomes a static import
again.

## Verification

Playwright on two copies of the venture directory, old and new `index.html`,
service workers blocked, script at the run's scratchpad (`check.cjs`):

| | old | new |
|---|---:|---:|
| modules fetched on load | 53 | 48 |
| raw JS bytes on load | 1,160,293 | 934,978 |
| page errors | 0 | 0 |

Same answers: reading one receipt, planning one Stripe payout row, running the
annualized worksheet, and reloading with a receipt on file produced the same
status lines and card text, character for character, on both pages.

Timing, same harness with CDP 4x CPU throttle and 150 ms / 1.6 Mbit/s network,
`loadEventStart`, seven alternating runs each:

- old: 7620 7520 7568 7548 7474 7488 7595 ms, median 7548
- new: 6459 6376 6471 6354 6490 6378 6362 ms, median 6378

The local server sends files uncompressed, so this overstates the network part:
Cloudflare compresses, and at 1.6 Mbit/s the 72 kB gzip saved is about 0.36 s.
The parse and compile of 225 kB less JavaScript comes on top of that.

`node --test page.test.mjs`: 27 pass. Full suite:
`python3 platform/ci/run_venture_tests.py ai-bookkeeper` (result in the run
record's notes).

## Not changed, ranked for the next run

1. **shed-designer (384 kB gzip, 55 files).** `model.mjs` 51 kB and
   `drawings.mjs` 26 kB; run `module-exclusive.mjs` on it first. A design tool
   probably renders its model at once, so the saving may be in the drawing and
   export paths only.
2. **league-schedule-generator (258 kB).** `calc.mjs` alone is 67 kB gzip;
   `carryover.mjs` and `divisions.mjs` look like option paths.
3. **ai-bookkeeper's remaining small leaves** (`pdftext`, `loans`, `xls`,
   `scorp`, `ai`, `xlsx`: 3 to 7 kB each, about 26 kB together). Each is a
   handler-only import; worth doing in one pass if anyone touches those cards.
4. P063 and P064 remain owner-gated (workflow files).
