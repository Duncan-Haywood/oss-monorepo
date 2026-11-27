---
kind: polish
topics: [design, accessibility]
date: 2026-11-27
---

# Polish 2026-11-27: contrast.mjs can press a button first; shop calculators' tables reachable by keyboard

Track: polish/0. Item 4 of `polish-2026-11-27-payapp-dark-paste.md` (contrast.mjs only saw pages as
loaded, so result panels went unread), and the defect the widened run then pointed at on the bet #2
front doors.

## What changed

- `platform/pages/contrast.mjs`: `CLICK='<selector>,<selector>'`. On each page, every listed selector
  that is present and visible is clicked, the page settles, and axe runs again. Findings already seen
  before the click are not repeated; new ones carry `+click(<selector>)` in their viewport label. Pages
  without the selectors are measured once, as before. The axe pass and its sticky-panel re-measure
  moved into `measure()` so both passes share it. Documented in `platform/pages/README.md`.
- `cnc-machining-quote-calculator`, `laser-cutting-engraving-job-price-calculator`,
  `powder-coating-job-price-calculator` (front doors to bet #2, jobshop-quote): the results tables'
  sideways scrollers (`div.scroller` / `div.scroll`, 8 in all) get `tabindex="0"`, `role="region"`, an
  `aria-label` taken from the table's heading, and a focus ring. On a phone these overflow, and a
  keyboard user could not scroll to the price columns.

## Measured

Pages served straight from `ventures/` (`DIST=ventures ONLY_SLUGS=...`), axe-core 4.10.2, 390 and
1280 px, light and dark.

| | before | after |
|---|---|---|
| fixture: `#ccc` answer revealed by `#load-example`, no `CLICK` | pass (missed) | pass (missed) |
| same fixture, `CLICK=#load-example` | option did not exist | fails, 1.6:1, 2 nodes |
| 5 bet front doors (9 pages), `CLICK=#load-ok,#load-example,#example,#loadExample` | n/a | pressed on 16 page runs; no new findings after the click |
| `scrollable-region-focusable`, the three shop calculators, phone | 8 nodes | 0 |
| contrast.mjs, the three calculators + pay-application-generator, with CLICK | 8 violations | clean |
| venture suites (cnc / laser / powder) | 104 / 29 / 29 pass | 104 / 29 / 29 pass |

The remaining finding in the 9-page run is `html-has-lang` on
`jobshop-quote/apps/jobshop-site/test/worker/fixtures/index.html`, a test fixture that is not
published; left alone.

## Still weakest, next

1. Run `contrast.mjs` with `CLICK='#load-example,#load-ok,#example,#loadExample,#sample'` over a full
   build (`SKIP_PREFIXES=writing/`, or `SAMPLE_EVERY=10`). 706 pages carry `#load-example` and 181
   `#load-ok`; their result panels have never been measured. Fix the families it finds.
2. Carried: the CNC / laser / powder-coat calculators have no dark mode (copy the token block from
   `ventures/pay-application-generator/index.html`).
3. Carried: the pay-application template guide's formula `div.scroll` has no `tabindex`/label.
4. Carried from the shop note: the `id="report" aria-live="polite" hidden` template on 454 venture
   pages; `stack-overflowing.mjs` and `th` holding an element with an `id`.
