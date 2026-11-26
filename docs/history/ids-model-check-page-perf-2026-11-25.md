# IDS Model Check: the page loads its report and spreadsheet code on first use (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch owner-only workflow files and still wait for
the owner. `node platform/perf/module-weight.mjs .` ranked the venture pages
by static module weight; of the heavy ones, shed-designer, ai-bookkeeper, XER,
changepoint, IFC, wall-framing, shift-roster, league and pay-application have
all had page passes. `ids-model-check` (164 kB gzip, 21 modules, for-profit
row 9 in `portfolio/monetization/transition.py`) had only had test-suite passes
(`ids-model-check-perf-2026-11-23.md`), so it was next.

## Reading (before)

The page's one inline module statically imported ten modules. Their closures
(gzip level 6, static `import`/`export from` edges followed):

| direct import | closure gzip | used before a file or button? |
|---|---:|---|
| `spec-doc.mjs` | 112.6 kB (pulls `ids.mjs`, `step.mjs`, `ifcxml.mjs`, `ifcjson.mjs`, `ifcx.mjs`, `audit.mjs`, ...) | no: readable-document buttons |
| `bsdd-suggest.mjs` | 108.3 kB (same parsers) | no: after an audit |
| `excel2ids.mjs` | 69.9 kB | no: a dropped spreadsheet, or a button |
| `sheet.mjs` | 56.3 kB | no: after an audit |
| `fix.mjs` | 23.9 kB | no: after an audit |
| `html-report.mjs`, `bcf.mjs`, `report.mjs` | 6.8, 2.5, 1.8 kB | no: download buttons |
| `zip.mjs`, `usage.mjs` | 1.9, 0.9 kB | yes |

Union: 164 kB gzip. The IDS parser and model readers in it are the ones the
worker (`worker.mjs`) loads for itself to run the check, so the main thread
was fetching and compiling a second copy before the first click.

Throttled load: local static server with gzip and `cache-control: no-store`,
Chromium, 150 ms latency, 1.6 Mbit/s down, CPU 4x slower, service workers
blocked; navigation to `load`; 7 runs. Same conditions as the
pay-application, wall-framing, babysitting and XER passes.

## Change

`ventures/ids-model-check/index.html` only. The eight heavy static imports
became `import()` calls behind a memoised `lazy()` loader, awaited where each
is used: the spreadsheet reader when an .xlsx/.csv IDS is dropped, `fix.mjs`
and `sheet.mjs` at the top of the audit reply (with a stale-reply guard after
the await, since a newer check can start meanwhile), `spec-doc.mjs`,
`excel2ids.mjs`, `bcf.mjs`, `html-report.mjs` and `report.mjs` in their
download handlers, `bsdd-suggest.mjs` in `showBsddLinks`. `usage.mjs` and
`zip.mjs` stay static. The offline bundle (`collectOfflineBundle` in
`platform/pages/build.mjs`) saves every `.mjs` in a tool's folder, so
"Save for offline" still covers the lazy modules; `preload.mjs` already
leaves dynamic imports alone.

Tests: `page.test.mjs` now also walks `import("./x.mjs")` (so a lazy module
must still exist and be browser-safe), and a new test pins the static imports
to `usage.mjs` and `zip.mjs`; `html-report.test.mjs` checks the lazy form.

## After

| | before | after |
|---|---:|---|
| static module graph, gzip | 164 kB, 21 files | 2.8 kB, 2 files |
| transfer to `load` (CDP `encodedDataLength`) | 194,311 B | 25,013 B |
| throttled `load`, 7-run median | 1,793 ms (1,780 to 1,822) | 534 ms (513 to 587) |
| `index.html` gzip | 20,963 B | 21,373 B |

## Verification

- `python3 platform/ci/run_venture_tests.py ids-model-check`: 627 tests pass
  (28.9 s), plus the site page checks it runs.
- Playwright, both versions, unthrottled: "Try a tiny sample", check, then
  BCF, HTML and CSV downloads; "Audit the IDS only", then .xlsx, .csv,
  readable .html and .md, and Excel2IDS downloads. Every file has the same
  size before and after, and the same hash except the BCF zip and HTML report,
  which carry the time of the check. The Excel2IDS note text is identical. No
  page errors. The bSDD and repaired-IDS offers are not shown for the starter
  IDS in either version, so those two paths were exercised by the tests only.

## Not changed, ranked for the next run

1. **`editor.html`** (the IDS editor) and `revision.html`/`cobie.html` were not
   measured; the editor imports `editor.mjs` (25 kB gzip) and probably the
   parsers too.
2. **The worker's own graph**: it loads every reader (STEP, ifcXML, ifcJSON,
   IFC5) before it knows the model's format. Splitting by format would cut a
   first check's fetch, but the worker starts on the first click, not on load.
3. **`index.html` itself is 21 kB gzip**, most of it the FAQ and the long
   how-it-works copy, which are the SEO surface; leave it.
4. P063 and P064 remain owner-gated (workflow files).
