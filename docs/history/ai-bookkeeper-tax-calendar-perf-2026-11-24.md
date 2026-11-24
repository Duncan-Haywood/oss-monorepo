# AI Bookkeeper tax calendar: 263 kB of engine it never ran (2026-11-24)

Perf track, version 0, item 4 ("what visitors wait on"). Both perf backlog
items (P063, P064) are still owner-gated workflow edits, so this run took a
fresh page-weight reading of the built site and chose by the North star: the
heaviest page that is a front door to a paid bet and does not need its weight.

## Reading

`node platform/pages/build.mjs --out=<dir>` at `763a927ec` (exit 0), then a
walker over all 13,149 built pages: gzip of the HTML plus everything loaded
eagerly (script `src`, stylesheets, `modulepreload`/`preload`, non-lazy
images), module scripts followed through their static `import` graph.
Median 16.0 kB, p90 35.0 kB, p99 65.2 kB. Top of the list:

| page | eager gzip | files |
|---|---:|---:|
| `shed-designer/index.html` | 377 kB | 54 |
| `ai-bookkeeper/index.html` | 369 kB | 48 |
| `research/marine-hull/index.html` | 337 kB | 2 |
| `research/cell-fidelity/index.html` | 304 kB | 2 |
| `xer-schedule-check/index.html` | 275 kB | 31 |
| **`ai-bookkeeper/tax-calendar.html`** | **267 kB** | **31** |

The first five are apps whose first screen is the tool, or research records,
and all of them had passes in the last week. The tax calendar is different: a
form that lists filing dates. It needs a holiday table and a due-day table,
yet `node platform/perf/module-exclusive.mjs ventures/ai-bookkeeper/tax-calendar.html`
reported 263 kB gzip over 31 files, because:

- `calendar.mjs` imported `estimatedDueDates` from `taxforms.mjs`, which
  imports `engine.mjs`, `categorize.mjs`, `ledger.mjs`, `deductions.mjs`, ...;
- `calendar.mjs` and the page imported due-date helpers from
  `salestaxreturn.mjs`, whose one engine import (`journal`) is used only by
  `salesTaxReturn` itself.

## Change

- `salestax-rules.mjs` (new): everything in `salestaxreturn.mjs` above
  `salesTaxReturn`, moved verbatim (state due days, sources, notes, discounts,
  US holidays, business-day rollover, `salesTaxDueDates`). No imports.
  `salestaxreturn.mjs` re-exports its 18 public names, so every caller,
  CLI and test is unchanged; the four period helpers `salesTaxReturn` uses
  are imported, not re-exported.
- `irsdates.mjs` (new): `dcHoliday`, `estimatedDueDates` and
  `fileAndPayDeadline`, moved verbatim from `taxforms.mjs`, which imports and
  re-exports them.
- `calendar.mjs` and `tax-calendar.html` import from the two small modules.
- `sw.js`: both files added to the offline shell, cache `v18` to `v19`
  (`page.test.mjs` caught the missing shell entry).
- `tax-calendar-graph.test.mjs` (new): pins the page's static graph to
  exactly `calendar.mjs`, `irsdates.mjs`, `salestax-rules.mjs`, `usage.mjs`,
  and checks the re-exports are the same function objects.

## Verification

- Static graph: 263 kB gzip / 31 files before, **21 kB / 4 files** after.
  The bookkeeper's `index.html` goes from 324 kB / 48 to 326 kB / 50 (two
  more files, same code; per-file gzip overhead). Every other
  `ai-bookkeeper/*.html` page is unchanged (`module-exclusive.mjs` over all
  of them, diffed).
- Same answers: Playwright in Chromium, the page from `git archive HEAD`
  next to the new one, five inputs (2026 none; CA monthly + payroll +
  contractors; TX annual; IN semiannual + payroll; NY quarterly, both boxes):
  the date table text is identical and there are no page or console errors.
- Speed: navigation until the dates are on screen (state list filled, then
  Show my dates), median of 3, cache disabled, uncompressed local server:

| | local before | local after | 1.6 Mbps / 150 ms before | 1.6 Mbps / 150 ms after |
|---|---:|---:|---:|---:|
| dates shown | 155 ms | 129 ms | 4,528 ms | 739 ms |
| DOMContentLoaded | 90 ms | 40 ms | 4,480 ms | 692 ms |

  The live site gzips, so its absolute times are smaller; the ratio holds.
- `python3 platform/ci/run_venture_tests.py ai-bookkeeper`: ok, 3,452 tests
  (1 skipped: OCR tools not installed), 23.3 s.

## Not changed, ranked for the next run

1. **`shift-roster-builder/availability.html` (131 kB, 2 files) and
   `shifts-from-sales.html` (167 kB, 5 files)**: sub-pages of an app, worth
   the same "what does this page actually call" check.
2. **`shed-designer/hoa-packet.html` (220 kB, 26 files)**: a packet page;
   check whether it needs the full designer graph.
3. **`guides/index.html` (205 kB of HTML alone)**: a site-wide index;
   pagination or a lighter card would cut it, a pages-builder change.
4. The research programme indexes (marine-hull 337 kB, cell-fidelity 304 kB)
   remain the research track's call, as the 2026-11-22 note said.
5. P063 and P064 remain owner-gated (workflow files).
