# AI Bookkeeper page: file readers, S-corp, AI, reconcile and bill pay load on first use (2026-11-25)

Perf track, version 0. Both open perf backlog items (P063, P064) touch workflow
files in `.github/CODEOWNERS` and wait for the owner. Under the north star
(`prompts/goals.md`, "North star"), this run looked at the for-profit products in
`portfolio/monetization/funnel.json`. quick-pick-survey was checked first and
is already light (`rank.html` 38 kB gzip, 8 files), so the run took item 3 of
`ai-bookkeeper-page-perf-2026-11-22.md`'s "not changed" list: ai-bookkeeper's
small handler-only leaves. ai-bookkeeper is the second-heaviest page graph in
`ventures/` and has 14 free feeder tools pointing at it.

## Reading (before)

- `node platform/perf/module-exclusive.mjs ventures/ai-bookkeeper/index.html`:
  **326 kB gzip, 50 files**. Leaves only the page imports: `pdftext` 7k,
  `loans` 5k, `xls` 4k, `scorp` 4k, `ai` 3k, `textcodec` 3k, `xlsx` 3k,
  `statement` 3k, `invoice` 2k, `billpay` 2k, `reconcile` 2k, `livefile` 2k,
  and four under 2k.
- Throttled load: the bench below, 7 runs, median time to
  `domContentLoadedEventEnd`. **2,937 ms** (2,907 ms in a second set run beside
  the new page), 52 files, 382 kB on the wire.

## Which leaves moved, and which stayed

Each name was traced to where the script uses it (`grep -nw`):

| module | used in | moved? |
|---|---|---|
| `pdftext`, `xlsx`, `xls`, `textcodec` | `readInput()`, already async, runs on file pick and import | yes, one loader |
| `scorp` | `#est-scorp` click | yes |
| `ai` | `#ask-ai` click, already awaits the model | yes |
| `reconcile` | `#recon-check` click | yes |
| `billpay` | `#bp-plan` click | yes |
| `loans` | `renderLoans()`, called by every `render()` | no |
| `budget`, `compare`, `collections` | render-time tables | no |
| `invoice`, `statement` | Print/Statement buttons call `window.open`; an `await` first risks the popup blocker | no |
| `livefile` | live-file restore at start-up | no |

The four file readers load together through a memoised `onDemand` loader (the
helper the XER and shift-roster pages use; a failed load is forgotten, so the
next pick retries), in parallel with `f.arrayBuffer()`. A pasted statement never
loads them. The four click handlers became `async` with the `import()` inside
their existing `try`, so a failed load shows in the card's status line. The AI
handler had no `try`; only the import is wrapped, so `aiSuggest`'s own
behaviour is unchanged.

## Verification

- **Same answers.** A Playwright script (`equiv.cjs`, below) loaded the old page
  (`HEAD`'s `index.html` saved beside the same modules) and the new one in fresh
  contexts, ran six scenarios and compared the whole `document.body.innerText`:
  importing a CSV (`fixtures/ally-checking.csv`), an XLSX
  (`generic-statement.xlsx`), an XLS (`generic-statement.xls`) and a PDF
  (`statement-chromium.pdf`); the example books, then S-corp, reconcile at
  691.50 and bill pay; the example books, then Ask AI with no provider.
  **6 of 6 identical**, no page errors on either.
- **Tests.** `page.test.mjs` gains a test that the eight modules are not static
  imports, are loaded by `import()`, and export every name the handlers
  destructure, and that invoice and statement stay static. The existing
  S-corp assertion now checks the dynamic import (the way the line above it
  already checks `annualized`). `python3 platform/ci/run_venture_tests.py
  ai-bookkeeper`: ok, 3,453 tests, 25.0 s, 1 skipped (no OCR tools here).

## After

| median of 7, throttled | before | after |
|---|---:|---:|
| static graph, gzip (`module-exclusive.mjs`) | 326 kB, 50 files | **297 kB, 42 files** |
| files fetched by load | 52 | **44** |
| bytes on the wire | 382 kB | **351 kB** |
| time to DOMContentLoaded (set 1) | 2,937 ms | 2,650 ms |
| time to DOMContentLoaded (set 2, back to back) | 2,907 ms | **2,622 ms (−10%)** |

The readers cost one round trip on the first file pick (four files in
parallel, about 17 kB gzip), once per visit.

## Not changed, ranked for the next run

1. **The engine core is the page.** `engine.mjs` imports `brands.mjs` (46k),
   `categorize.mjs` (38k) and `bank.mjs` (38k); every render reads them. What
   is left is either a smaller brand table (a data change: which merchants the
   categoriser knows) or rendering cards lazily as they scroll into view, a
   product change.
2. **`loans` (5k) and the render-time tables** could load once the books contain
   a loan or a budget, but `render()` is synchronous; making it wait on a module
   touches every card.
3. **`invoice`/`statement`** could preload on hover or on the first render
   with open invoices, keeping the click synchronous. Small (5k together).
4. Item 1 of the 2026-11-24 tax-calendar note (shift-roster sub-pages,
   `shed-designer/hoa-packet.html`) is still open.
5. P063 and P064 remain owner-gated (workflow files).

## Bench scripts

`load.cjs <dir> <runs> [page]` follows the method of
`shift-roster-page-perf-2026-11-24.md`: a local gzip server, every other host
aborted, CDP `Network.emulateNetworkConditions` (150 ms, 1.6 Mbit/s down),
`Emulation.setCPUThrottlingRate` 4, cache disabled, a fresh context per run,
reading `performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd`.
`equiv.cjs` serves the same folder without gzip, drives the scenarios above
with `setInputFiles` and clicks, waits 1.5 s, then compares `innerText`.
Neither is in the tree (both ran from the session's scratchpad). Each is about
30 lines, and the description above is enough to rebuild them.
