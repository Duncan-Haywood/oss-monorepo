# Polish 2026-11-12: shop-rates and saved-bids bars aligned with each page's heading

**Why this item.** Screenshots of the hub, the top flagship (wall-framing-takeoff), research,
Stories, the writing index and a post at 390 and 1280 px. The flagship's first screen at 1280 px
had its "Saved bids / Copy link" bar 30 px right of the `h1`. The bar is shared, so I measured
every page carrying it.

**How it was measured.** Full local build. A Playwright script served `dist/` (third-party
requests blocked) and loaded each of the 168 pages with `[data-pf-jobs-root]` at 1280, 1024 and
390 px. It recorded the bar's inner left edge (rect left + padding + border) against the `h1`'s
left edge, the same for `.pf-rates`, and `scrollWidth`. For the after numbers, `pf-jobs.js` and
`pf-rates.js` were regenerated into `dist/` from `renderSavedBidsModule()` and
`renderShopRatesModule()`.

| | before | after |
|---|---|---|
| saved-bids bar within 2 px of the h1, 1280 px | 132/168 (36 off by 10 to 170 px) | 168/168 |
| same, 1024 px | 166/168 | 168/168 |
| same, 390 px | 166/168 (quote-margin-check, translator-project-quote off 18 to 20 px) | 168/168 |
| shop-rates bar within 2 px, 1280 px | 88/118 | 118/118 |
| pages scrolling sideways (any of the three widths) | 0 | 0 |

The pages that were off at 1280 px were the trade bid calculators (h1 at 70 to 100 px, bar text
at 110), wall-framing-takeoff (80 vs 110), forestry-mulching (50), trade-bid-studio (90),
quote-margin-check (280) and translator-project-quote (233).

Screenshots: `docs/reports/img/bar-align-{wall-framing-takeoff,deck-bid-calculator}-{before,after}.png`.

## What changed

- `platform/pages/bar-align.mjs` (new): `BAR_ALIGN_JS`, an ES5 `pfAlignBar(root)` pasted into both
  bar scripts. On reveal, it sets `max-width:none`, zero side margins, padding-left to the h1's
  left, and padding-right so the right edge mirrors the left about the page centre. It bails out
  (inline styles cleared) when there is no h1, the h1 is above the bar or inside it, the left
  padding would be negative, or the column would be under 240 px. It re-runs on resize, one per
  animation frame.
- `platform/pages/jobs.mjs`: calls it in `start()` right after `root.hidden = false`.
- `platform/pages/rates.mjs`: calls it once on the first `render()`.
- `platform/pages/bar-align.test.mjs`: the two modules carry and call it and parse, and six
  Chromium cases (wider column, narrower column, already aligned and left untouched, no heading
  or heading above, squeezed column, phone).

First attempt used the h1's parent content box for the right edge. On artificial-turf the h1 is in
a 740 px `<header>`, so the bar was squeezed to 740 px. The mirror rule replaced it.

## Layout shift: no change, but a pre-existing header race

CLS on all 168 pages at 1280 and 390 px (PerformanceObserver, 500 ms after load), two runs each:

| | loads with any shift (of 336) | CLS sum |
|---|---|---|
| before, run 1 / run 2 | 120 / 135 | 0.724 / 0.801 |
| after, run 1 / run 2 | 136 / 129 | 0.765 / 0.790 |

Run-to-run noise, no change. Every shift I traced came from `nav.pf-chrome.pf-chrome-top` going
from 1060 px at x=110 to 1280 px at x=0. The full-bleed `fit()` lives in `pf-site.js`, a classic
script at the end of `<body>`, so the browser can paint the un-fitted header mid-parse and then
`fit()` moves it. Same page, ten loads: 2/10 shifted with the old scripts, 5/10 with the new ones,
which is the same race. Largest single value 0.015 (good is under 0.1).

## Still weakest, and what I would do next

1. **The header full-bleed race** above. A CSS first guess for `nav.pf-chrome-top` when its parent
   is centred (`margin-inline: calc(50% - 50vw)`, with `fit()` still correcting), or moving the
   fit to an inline script right after the nav, would let the first paint be the fitted one.
   Measure with the same 168-page CLS script (ten loads per page, since it is a race).
2. **The bars sit above the `h1`** on every tool, so a first-time visitor's first line is "Save your
   rates once" rather than the tool's name. Moving them under the heading block, or into one row,
   is a design decision with layout-shift risk; measure the first-screen height first.
3. Carried over from the research reports: twins topic page still 38,413 px at 390 px; index theme
   sections 19,761 px; `.pager` defined twice in the writing STYLE; 190 posts with no related link.
