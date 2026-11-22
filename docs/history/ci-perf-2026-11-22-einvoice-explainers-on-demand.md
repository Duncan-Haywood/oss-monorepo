# einvoice-preflight: the Mexico and Brazil explainers and the creator load their checkers on demand (2026-11-22)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). Both
perf backlog items (P063, P064) are still owner-gated, and the per-suite
timings found nothing worth a change: `sales-agent` is 10.3 s over 45 files
with no file above 1.1 s, `ai-bookkeeper` 76.9 s over 350 files with the top
file at 2.3 s (process start-up, not a hot loop). So this run took a fresh
page-weight reading of the built site.

## Reading

`node platform/pages/build.mjs --out=<dir>` at `2a5d14131` (2 m 49 s wall),
then a walker over all 12,543 built pages summing the gzip size of the HTML
plus everything it loads eagerly (`<script src>`, stylesheets, `modulepreload`
and `preload` links, images without `loading="lazy"`): median 17.3 kB, p90
65.4 kB, p99 91.6 kB. Top of the einvoice venture:

| page | eager gzip before |
|---|---:|
| `create.html` | 467 kB |
| `mexico-cfdi-e-invoice-mandate.html` | 372 kB |
| `brazil-nfe-e-invoice-mandate.html` | 273 kB |
| `index.html` (fixed 2026-11-20) | 45 kB |
| every other einvoice page | 45 kB or less |

The build caps module preloads, so those figures undercount. The full static
import graphs (`import ... from "./x"` followed recursively, level-6 gzip
summed):

| page | static graph before | static graph after |
|---|---:|---:|
| Mexico | `cfdi.mjs` 13 modules, 978 kB raw, 338 kB gzip | `mexico.mjs` 1 module, 1.4 kB gzip |
| Brazil | 5 checkers, 23 modules, 1,077 kB raw, 233 kB gzip | `brazil.mjs` 1 module, 1.3 kB gzip |
| create | 107 modules, 3,184 kB raw, 896 kB gzip | `generate.mjs` + `usage.mjs` 38 modules, 87 kB gzip |

A module script runs only after its whole static graph has arrived, and it
delays `DOMContentLoaded`. On the two explainers that held up even the RFC and
CNPJ/CPF checks, which need 1.4 kB; on the creator it held up the form's live
totals, which need only `generate.mjs`.

## Change

- Mexico: `cfdi.mjs` comes from `import()` in `loadCfdi()`, which `show()`
  awaits. `mexico.mjs` (the RFC check) stays a static import.
- Brazil: the NF-e, NFS-e, event, ABRASF and DSF checkers come from one
  `Promise.all` of `import()`s in `loadBr()`. Every `show*` function and the
  event file and convert handlers await `ready()` first. `brazil.mjs` stays
  static.
- create: `facturx-pdf.mjs` and `report.mjs` come from `loadHeavy()`, which the
  Create button awaits before its Factur-X profile check. The unused
  `parseInvoiceSource` import is gone.
- On all three, the first `pointerdown`, `focusin` or `keydown` anywhere on the
  page starts the fetch, so the checker is usually there by the time a sample
  or file is picked. A failed fetch clears the loader so the next click
  retries, and the visitor sees "did not load, try again" rather than nothing.
- Tests: the pinned `import{checkX}from` assertions now pin the `import()`
  specifier and the binding. A new test per page pins the static import list
  (only the small ID module, or `generate.mjs` + `usage.mjs`), so a later edit
  that puts a checker back on the static path fails. `page-create.test.mjs`
  also checks that each `import()` target exists.

## Verification

- Same answers: Playwright in Chromium against `python3 -m http.server`,
  original page (from `git show HEAD:`) next to the new one. Every sample tried
  (Mexico CFDI, Brazil NF-e, DSF and event, the creator's example then Create
  with preflight) printed the same result text before and after, with no page
  or console errors.
- Speed: time from navigation until the page's static check answers (typing an
  RFC or CNPJ until its output fills; for the creator, Load example until the
  totals fill), median of 3, cache disabled, uncompressed local server:

| page | local before | local after | 1.6 Mbps / 150 ms before | 1.6 Mbps / 150 ms after |
|---|---:|---:|---:|---:|
| Mexico | 102 ms | 78 ms | 5,660 ms | 559 ms |
| Brazil | 121 ms | 98 ms | 6,175 ms | 685 ms |
| create | 261 ms | 149 ms | 17,109 ms | 2,745 ms |

  `DOMContentLoaded` moved the same way (Mexico 5,634 to 540 ms throttled). The
  local server sends files uncompressed, so the live site's absolute times are
  smaller, but the ratio holds. A visitor who clicks a sample in the first
  second still waits for the checker, as before (5.7 s before, 5.8 s after,
  throttled); one who reads or types first finds it loaded.
- `python3 platform/ci/run_venture_tests.py einvoice-preflight` and a full
  Pages build: results in the PR's run record.

## Not changed, ranked for the next run

1. `research/marine-hull/index.html` (271 kB gzip of HTML alone),
   `research/cell-fidelity/index.html` (233 kB), `heavy-hydraulics` (189 kB),
   `verified-dse` (179 kB): research programme index pages that inline every
   milestone. Paginating or folding older milestones would cut the largest
   eager pages on the site; it is the research track's call, since those pages
   are the programmes' record.
2. `ai-bookkeeper/index.html` 477 kB eager (58 deps), `shed-designer/index.html`
   470 kB (61), `league-schedule-generator/*` 245 to 319 kB across nine pages
   (`calc.mjs` 69 kB and `carryover.mjs` 42 kB on each), `wall-framing-takeoff`
   361 kB, `babysitting-business-kit` 297 kB. Same split as here: keep what the
   first screen needs static and `import()` the solver on first use. These are
   app pages whose first screen is the tool, so measure the gain before taking it.
3. `research/fonts/Inter.woff2` (48 kB) is preloaded on 1,112 research pages.
   It is the only web font; a preload is right if it renders above the fold.
