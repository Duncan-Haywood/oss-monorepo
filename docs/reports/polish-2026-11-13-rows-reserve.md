---
kind: polish
topics: [performance, layout-shift, impressive]
date: 2026-11-13
---
# Polish 2026-11-13: 67 tools stop jumping when their starting rows arrive

**Why.** Item 1 of "Still weakest" in `polish-2026-11-13-band-gap.md`: desktop layout shifts on the
bid tools came from "the tools' own starting rows (`STARTING_OPENINGS.forEach(addOpeningRow)` in a
module script), which push the 'Add an opening' button and the next section down after first paint".
That report expected a tool-by-tool fix. It turned out to be one pattern, so one script fixes it.

**The pattern.** The tool ships an empty `<div id="openings"></div>` and its `<script type="module">`
fills it with editable rows. Module scripts run after the document is parsed, so the browser may paint
the page with the host at 0 px and then push everything under it down by the rows' height (884 px on
window-replacement at 1,280 px). `blocking="render"` is not an option: it only works on elements in
`<head>`, and it would hold the whole page for the module's imports.

**What changed.**

1. `platform/pages/rows-reserve.mjs` (new). Opens each venture whose `index.html` has a bare
   `<div id="..."></div>`, keeps the ones that hold form controls after `load` (the rows hosts),
   measures each host's height at every 4 px from 320 to 1,600 px, groups the widths into at most six
   bands, and writes a block before `</head>`:
   `@media (scripting:enabled){html:not(.pf-rows-ready) #openings:empty{min-height:…}}` per band, plus
   a one-line inline script that adds `pf-rows-ready` on `DOMContentLoaded` (module scripts have run
   by then). Each band reserves the smallest height measured in it, and also 24 px narrower, for a
   desktop scrollbar, so the rows never arrive shorter than the space held for them. With JavaScript
   off, or after a visitor removes every row, the rule does not match and no gap appears.
2. 67 venture `index.html` files carry the block (26 bid calculators and 41 other tools with row
   editors: worker-classification-checker, vsme-report-builder, safe-dilution-calculator, the
   `#files` checkers, ...). Seven tools measured no change and were left out (`SKIP` in the script):
   their shift comes from something else (see "Still weakest").
3. `platform/pages/rows-reserve.test.mjs`: every tool that runs `STARTING_*.forEach(add…)` into an
   empty host has a block, every reserved id is still an empty `<div id>` in the page, and the band
   maths never reserves more than it measured.
4. `ventures/janitorial-bid-calculator/page.test.mjs`: its "swallowed document" fixture deleted the
   first `</style>`, which the new block's `</style>` then closed again. It now deletes the last one;
   the guard still fails a swallowed document the way it should.

## Numbers

Full local build of main, served from `dist/`, pre-installed Chromium, third-party requests blocked,
viewport × 900, a buffered `layout-shift` observer (inputs excluded) read 500 ms after `load`, three
loads per page, six tabs. "After" is the same `dist/` with the block spliced into those 74 pages'
`<head>`, exactly as `writeBlock` writes it into the source.

| 67 pages kept | 1,280 px before | after | 390 px before | after |
|---|---|---|---|---|
| CLS, sum of per-page means | 2.954 | **0.073** | 1.807 | **0.000** |
| pages with any shift (mean > 0.001) | 62 | 6 | 44 | 0 |
| pages over Google's 0.1 "good" line | 3 | 0 | 6 | 0 |
| worst page | 0.446 worker-classification-checker | 0.030 attic-insulation | 0.225 worker-classification-checker | 0 |

Biggest single drops at 1,280 px: worker-classification-checker 0.446 → 0, vsme-report-builder 0.412 →
0, app-listing-metadata-check 0.138 → 0, window-replacement 0.087 → 0, safe-dilution 0.085 → 0. At
390 px: window-cleaning 0.132, junk-removal 0.120, painting 0.106, all → 0. No page got worse at
either width.

Screenshots (window-replacement at 1,280 px, the module held back to show what the browser can paint
before the rows exist): `img/polish-2026-11-13-rows-reserve-before.png` ("The openings" is a heading
and a button, with "The job" right under it, all about to move 884 px) and
`img/polish-2026-11-13-rows-reserve-after.png` (the space is already held).

Tests: `node --test platform/pages/rows-reserve.test.mjs` 4/4; every changed venture's own
`*.test.mjs` passes (janitorial 239/239 after the fixture fix); the site build's suite (below).

## Still weakest, and what I would do next

1. **The seven skipped pages** shift for other reasons, at 1,280 px: retainage-cashflow-calculator
   0.201 (`#milestoneSection` revealed after load), shed-designer 0.194 (the canvas workspace, also
   0.088 at 390 px), delivery-app-margin-calculator 0.069 (a rates scroller grows), hvac-load-calc
   0.046 (a sizing note fills in), proposal-maker 0.033, str-host-payout-calculator 0.022. Each is
   its own fix; retainage and shed-designer first.
2. **Result `dt` rows growing** on attic-insulation (0.030) and drywall (0.005): an empty `dd` next
   to a `dt` grows from 20 to 60 or 80 px when the value arrives. A `dd:empty::before{content:"\a0"}`
   would hold one line, not a wrapped one; measure before choosing.
3. **Heights go stale** when a tool's row template changes. The test catches a renamed host, not a
   taller row. Rerun `node platform/pages/rows-reserve.mjs --base <server> --write <slug>` after
   changing a tool's rows (serving `ventures/` is enough: heights matched `dist/` to the pixel on
   the two tools compared).
4. Carried over from `polish-2026-11-13-band-gap.md`: the dead 26 px band rule; `.pager` defined
   twice in the writing STYLE; the ticker's third line at 320 px.
