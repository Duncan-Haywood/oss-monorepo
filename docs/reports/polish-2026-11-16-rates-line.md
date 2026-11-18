---
kind: polish
topics: [design]
date: 2026-11-16
---
# Polish: the shop-rates line fits beside its button on a phone (2026-11-16)

Track: polish/0. Picked item 1 of "Still weakest" in `polish-2026-11-16-saved-bids-lead.md`: on
the pages with both the shop-rates bar and the saved-bids bar, the rates sentence wrapped to two
lines at 390 px and its button took a third row. Open PRs searched (`polish in:title`): #11730,
#14012, #12397, none touch `rates.mjs`.

## What changed

- `platform/pages/rates.mjs`: `RATES_FIRST_VISIT_STATUS` is now "Save rates once for every bid."
  (30 characters, was 55). New export `RATES_FIRST_VISIT_MAX = 30`. One string at every width,
  no media-query swap, so the markup and the script still say the same thing (the layout-shift
  reservation depends on that).
- `platform/pages/layout-shift-guard.test.mjs`: a test caps the sentence at 30 characters.

## Measured (full local build, Playwright, JS on)

Fit test: each of the 124 pages with the rates bar, candidate text swapped into the status span,
"fits" = the span shares the button's row and is one line.

| sentence | 360 px | 390 px |
|---|---|---|
| Save your rates once — every calculator here uses them. (old) | 0 | 0 |
| Save your rates once for every bid. | 0 | 4 |
| Saved once, used on every bid. | 0 | 124 |
| Use the same rates on every bid. | 0 | 124 |
| One set of rates for every bid. | 121 | 124 |
| **Save rates once for every bid.** | 121 | 124 |

Both bars, 118 pages that carry both (top of `.pf-rates` to bottom of `.pf-jobs`, median):

| | 360 px | 390 px | 1,280 px |
|---|---|---|---|
| before | 132 px (rates 83) | 132 px (rates 83) | 85 px |
| after | 85 px (rates 36) | 85 px (rates 36) | 85 px |
| rates line on button's row, after | 117 / 118 | 118 / 118 | 118 / 118 |
| sideways scroll | 0 | 0 | 0 |

"After" was measured on the built `dist/` with the new string written into the 125 bar pages'
markup and `pf-rates.js` regenerated from the final `rates.mjs` (`renderShopRatesModule()`), not
from a second full build. Screenshots: `img/polish-rates-line-before-390.png`,
`img/polish-rates-line-after-390.png` (Painting Bid Calculator). Measuring scripts were throwaway
(Playwright over a local static server of `dist/`); the fit test takes about 3 minutes for 124
pages at two widths.

## Still weakest, and what I would do next

1. **The gap between the two bars** is 12 px of rates margin plus 8 px of jobs padding, so at
   phone width the pair still reads as two separate bands (85 px). Collapsing them into one band
   with two buttons ("Your shop rates · Saved bids") would save about 30 px more, but both bars
   have their own panels, reservation rules and alignment (`bar-align.mjs`): a bigger change.
2. **The three pages at 360 px where the line still wraps** were not identified by slug; a
   longer venture heading font is the likely cause.
3. Carried over: the tools topic index cards list projects by name and count only (one-line
   lede from `ventureLede` would help); 401 research and 409 tool posts name no project.
