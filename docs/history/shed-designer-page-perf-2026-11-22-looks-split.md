# shed-designer: the editor page stops loading the design search engine (2026-11-22, looks split)

A second pass on the same page the same day. PR #18293 (`shed-designer-page-perf-2026-11-22.md`)
landed first, from a parallel run: build steps (`instructions.mjs`) on demand and no wasted
live thumbnail on load, 384 to 366 kB gzip. This pass is independent of it and
stacks with it.

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). Both
open perf backlog items (P063, P064) touch workflow files in
`.github/CODEOWNERS` and wait for the owner. Item 1 of the "not changed" list in
`league-schedule-page-perf-2026-11-22.md` named this page: the largest venture
page graph, 384 kB gzip over 55 files.

## Reading (before, `241225222`)

`node platform/perf/module-exclusive.mjs ventures/shed-designer/index.html`
gives one row (the page has one module entry, `app.mjs`). To split it, a
probe page with `app.mjs`'s 31 static imports as an inline module script went
through the same tool:

| direct import of `app.mjs` | gzip it alone pulls in |
|---|---:|
| `picker.mjs` (+ `designfacts`, `designsearch`, `renders`) | 28 kB |
| `instructions.mjs` | 19 kB |
| `editor.mjs` | 7 kB |
| `utilisation-ui.mjs` (+ sheets) | 6 kB |
| `gallery-ui.mjs` (+ data) | 5 kB |
| the rest | 3 kB or less each |

Inside the picker's 28 kB, `designsearch.mjs` was 13.4 kB gzip (39,562 bytes
raw). That is the whole multi-design Pareto search, which only the gallery build
(`make-gallery.mjs`) and the tests run. The page reached it through one line in
`designfacts.mjs`: `import { looksOf } from './designsearch.mjs'`, so the
ready-design cards could show their looks score. `looksOf` needs two
one-line helpers and nothing else from the file.

## Change

- New `looksscore.mjs` (6,118 bytes raw, 2.6 kB gzip): `looksOf`, its doc
  comment, its two helpers (`r1`, `band`) and the `Looks`/`LooksTerm` typedefs,
  moved unchanged.
- `designsearch.mjs` imports it and re-exports `looksOf`, so its stable API
  and every caller (gallery, tests, `paretoaudit.mjs`) are unchanged.
- `designfacts.mjs` imports `looksOf` from `looksscore.mjs`.

## After

Same tool: **373 kB gzip, 55 files** on the pre-#18293 tree (-11 kB, -3%;
`designsearch.mjs` out, `looksscore.mjs` in). Merged with #18293: **355 kB
gzip, 54 files**, against 366 kB on main after #18293. `hoa-packet.html` was 217 kB before and after (it never
reached the search).

## Verification

- Same answers: `looksOf` over all 1,168 designs `searchDesigns({})`
  evaluates, run before and after, written to JSON: `cmp` identical.
- Browser (Playwright, chromium, local static server), old tree from
  `git archive HEAD` and new tree: old page requests `designsearch.mjs`, new
  page does not and requests `looksscore.mjs`; both request 55 modules; the 11
  ready-design cards' "Looks ..." lines are identical (same SHA-1); no console
  or page errors on either.
- `designfacts.test.mjs`: a new test walks `designfacts.mjs`'s static imports
  and pins that they reach `looksscore.mjs` and not `designsearch.mjs`, and that
  `designsearch.mjs`'s `looksOf` is the same function. `designfacts` +
  `designsearch` tests 25/25.
- Full suite: `python3 platform/ci/run_venture_tests.py shed-designer` -> ok,
  542 tests in 132.4 s (3 skipped: axe-core not installed here).

## Not changed, ranked for the next run

1. **`instructions.mjs` (19 kB gzip).** Done in PR #18293 (memoised `import()`
   inside `renderBuild`), which also measured that the byte saving alone did
   not move the throttled load time; its live-thumbnail fix did.
2. **`picker.mjs` (now ~17 kB exclusive).** It is mounted at start-up for the
   gallery strip, so it is needed; `renders.mjs` (3.7 kB) and `designfacts.mjs`
   (3.9 kB) are small.
3. **The shared core** (`model`, `estimate`, `drawings`, `render3d`, ...) is
   most of the 373 kB and is the editor itself.
4. P063 and P064 remain owner-gated (workflow files).
