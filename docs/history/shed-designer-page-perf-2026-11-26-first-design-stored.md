# Shed designer page: the first design is chosen when the gallery is made, not on every first visit (2026-11-26)

Perf track, version 0. No agent-workable `perf:` backlog item (P063, P064 and
P086 are owner rows). The runner pool reading (`ci_profile.py --runs 600`)
put every large consumer in a `priv-*` workflow, so the run took item 4,
"what visitors wait on", across the for-profit products in
`portfolio/monetization/transition.py`.

## Reading: which bet page is slowest

Full local build (`node platform/pages/build.mjs --out=DIR`, 2 min 57 s),
served by `platform/perf/revalidate-serve.mjs DIR 8411 60` (live-site
headers, 60 ms per request). A Playwright bench: 412x915 viewport, 4x CPU
throttle via CDP, `waitUntil: 'load'`, median `domContentLoadedEventEnd` of
3 runs. The live site was not reachable from the container (curl: 000).

| page | DCL ms | requests |
|---|---:|---:|
| **shed-designer** | **2,265** | 73 |
| wall-framing-takeoff | 1,079 | 24 |
| ai-bookkeeper | 772 | 47 |
| clothing-design-studio | 747 | 42 |
| changepoint-detector | 591 | 86 |
| xer-schedule-check | 538 | 36 |
| league-schedule-generator | 514 | 33 |
| babysitting-business-kit | 511 | 21 |
| shift-roster-builder | 472 | 12 |
| the rest of the 21 (einvoice-preflight, pay-application-generator, ifc, ids, ...) | 287 to 425 | |

The home page (455 ms) and the two paid landing pages,
`/industries/construction/` (12.7 kB gzip, two images, the second lazy) and
`/industries/eu-e-invoicing/` (10.2 kB gzip), are already light.

## Profile of the shed designer's load

One CDP sampling profile (100 µs, same throttle), inclusive time:

- `app.mjs` top level: 1,628 ms
- `load` → `firstDesign` (gallery-ui.mjs) → `cost` → `estimate`: **683 ms**
- `mountPicker` → `allFacts` → `designFacts` (one per strip card): 431 ms
- `render` → `storeEstimate`: 401 ms

`firstDesign()` priced two whole sheds (the 8x12 default as a cap, then the
balanced card) on every first visit, only to decide which gallery card to
open. Both inputs are fixed by the deploy: the gallery is searched by
`make-gallery.mjs` with that deploy's prices, and the default design and
example prices ship in the same tree.

## Change

- `gallery-ui.mjs`: the rule moves, unchanged, into `firstDesignId(designs)`.
  `firstDesign()` opens the card named by `FIRST_DESIGN_ID`, and works the id
  out with the rule only if that names no card (a hand-edited data file).
- `make-gallery.mjs`: `galleryModule()` runs `firstDesignId(rows)` and writes
  `export const FIRST_DESIGN_ID = "balanced";` under the gallery. The deploy
  already runs `make-gallery.mjs` before the site build, so the id is always
  chosen from that deploy's prices.
- `gallery-data.mjs` regenerated: the 1,254 lines of designs are
  byte-identical; only the three new lines are added. `make-gallery.mjs
  --check` passes.
- `gallery.test.mjs`: a new test asserts `FIRST_DESIGN_ID` equals
  `firstDesignId(GALLERY_DESIGNS)` at today's prices and that `firstDesign()`
  returns that card's design. The existing test (the first design is never
  dearer than the 8x12, passes every check, is a copy) is unchanged.

## After

Same bench, 7 runs each, before and after alternated twice on the same
server (only `gallery-ui.mjs` and `gallery-data.mjs` swapped):

| round | before DCL ms | after DCL ms |
|---|---:|---:|
| 1 | 2,315 | 2,118 |
| 2 | 2,383 | 2,009 |

About 200 to 370 ms (9 to 16%) off the throttled first visit. The profile's
`app.mjs` top level falls from 1,628 ms to 1,054 ms; `firstDesign` no longer
appears. Same first design ("balanced"), same 73 requests.

## Verification

- `python3 platform/ci/run_venture_tests.py shed-designer`: ok, 547 tests
  (132.7 s), 3 skipped (axe-core not installed), plus the site page checks.
- `node ventures/shed-designer/make-gallery.mjs --check`: current.

## Not changed, ranked for the next run

1. **Strip card facts (431 ms throttled).** `mountPicker` runs `designFacts`
   for every gallery card at start-up to print each card's price. The price
   on the strip could also be written by `make-gallery.mjs`, but cards are
   priced with the visitor's store choice and edited prices (`opts.priceOf`),
   so a stored number is only right for first-time visitors on default
   prices. Worth it with a fallback, but it needs care.
2. **`storeEstimate` on first render (401 ms).** The open design's estimate,
   which the page shows; `optimizeCuts` (the cut-list LP) is most of it.
   Already memoised per LP (`cachedLP`).
3. **wall-framing-takeoff (1,079 ms)** is the second-slowest bet page, but its
   free edition is frozen (`transition.json`: moved to `private-monorepo`).
4. P063, P064 and P086 remain owner-gated.
