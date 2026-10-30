# Polish run, 2026-10-28: the "Saved bids" band was on 1,110 pages

Track: polish (prompt 0). Surfaces looked at: hub, `/ai-bookkeeper/`, `/about/`,
at 390 px and 1280 px, none scrolling sideways.

## What looked weakest

A grey "Saved bids" button sat above the h1 of the AI Bookkeeper page, a bank-file
bookkeeping tool. The band (status line, panel with won/lost outcomes, "chase"
line, price band, "Copy bid link") is written for contractors, but
`injectSavedBids` gave it to every page with three or more fields: **1,110 of
1,331 tool pages**, including a 401(k) loan comparison and an ATS resume
checker. To a first-time visitor it reads as a mistake. The test that guards it
still says "234 copies", so the feature began as bid tools only and drifted.

## Change

`slugTakesSavedBids(slug)` in `platform/pages/jobs.mjs`: a tool gets the band if
it is in `platform/proposal/trades.json` or its slug names a bid, quote,
estimate, estimator, proposal or takeoff. `build.mjs` calls the injector only
for those, so the share row (which hangs on the band) follows.

| | before | after |
|---|---|---|
| pages with the band (`data-pf-jobs-root`, entry pages) | 1,110 | 168 |
| `/ai-bookkeeper/` "Saved bids" | yes | no |

`node platform/pages/check.mjs`: 1318 products, 5188 pages, no dead links.
`build.test.mjs` threshold for "pages carry the band" lowered from 200 to 100.

## Known costs and next steps

- The ~940 other tools lose "remember my form" and "copy a link to these
  numbers". A neutral "Save these numbers" version (noun taken from a
  `data-noun` on the band, runtime strings in `pf-jobs.js`) would give them
  back without the contractor wording. That is the better follow-up; the
  runtime has about 20 bid-worded strings.
- The slug heuristic misses some bid tools (e.g. `backflow-test-fee-calculator`,
  `tailor-alterations-shop-profit-calculator`) and is a guess; add them to
  `trades.json`.
- Band alignment: the band is `max-width:1060px` + 18 px padding, so on wide
  screens it sits about 30 px right of the page's own column.
- Mobile breadcrumb strip on flagship pages is a narrower white box than the
  viewport.
- Not measured: Lighthouse, search traffic. Usage is unmeasured, not zero.
