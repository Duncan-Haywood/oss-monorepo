# Polish 2026-11-12: shop-rates and saved-bids bars under the heading

**Why.** Item 2 of "Still weakest" in `polish-2026-11-12-bar-align.md`, carried into
`polish-2026-11-12-header-first-paint.md` item 3: the bars sat above the `h1` on every bid tool, so
a visitor's first line was "Save your rates once".

**How it was measured.** Full local build of main (`node platform/pages/build.mjs`, about 15 min).
The 174 built pages that carry either bar were measured as built ("before"). Then they were patched
in place to the new layout with the new `toolHeadingEnd`: the bar block was lifted out and put back
after the heading's `</header>`. The two bar modules were regenerated with `renderShopRatesModule` /
`renderSavedBidsModule`, and the new margin rule was spliced into `pf-chrome.css`. That gave the
"after" (a second 15-minute build for an insertion point was not worth it; the regenerated
`pf-jobs.js` differed from the built one only by the bar-align line). A Node static server, Chromium
with third-party requests blocked, 6 tabs, 390 × 740 and 1280 × 900, 500 ms after `load`. Measured:
`h1` top, top of the first visible `main` input/select/textarea, the bar's top, `scrollWidth -
clientWidth`, and buffered layout-shift sum without `hadRecentInput`.

| 174 pages | 390 before | 390 after | 1280 before | 1280 after |
|---|---|---|---|---|
| `h1` top median / p90 | 284 / 303 | 156 / 188 | 208 / 217 | 127 / 168 |
| first input median | 781.5 | 797.5 | 605 | 621 |
| first input delta | | +16 median, +20 max, 0 min | | same |
| pages with CLS > 0 (sum) | 6 (0.056) | 3 (0.033) | 69 (0.948) | 70 (0.879) |
| sideways scroll | 0 | 0 | 0 | 0 |
| gap band → first header child | 0 (bars hid it) | 16 on 171 pages | | 16 on 171 |

Screenshots (siding-bid-calculator):
[390 before](img/polish-2026-11-12-bars-under-heading-390-before.png) ·
[390 after](img/polish-2026-11-12-bars-under-heading-390-after.png) ·
[1280 before](img/polish-2026-11-12-bars-under-heading-1280-before.png) ·
[1280 after](img/polish-2026-11-12-bars-under-heading-1280-after.png).

## What changed

1. `toolHeadingEnd(html)` (jobs.mjs) gives the index after the `</header>` that wraps the first
   `h1` after the site nav. It returns -1 when the `h1` has no open `<header>` around it, or when that
   header holds an input, select, textarea, form or nested header. Survey of the build: 171 pages
   have the shape. 3 do not (translator-project-quote, bid-price-engine, quote-margin-check: `h1` in
   `<main>`) and keep the bars under the nav.
2. `injectShopRates` puts the bar there. `injectSavedBids` still follows the rates bar when there is
   one, and otherwise uses the same place, falling back to the nav and then `<body>`.
3. `bar-align.mjs`: the aligner no longer skips a heading above the bar (`hr.top < br.top`). The
   browser test for "a heading above the bar: left alone" became "is lined up with too".
4. `build.mjs` chrome CSS: `header:has(+ .pf-rates, + .pf-jobs){margin-top:16px}`.

## Found on the way

**The band's 26 px bottom margin never applies.** `.pf-chrome-top[data-pfs-head]{margin:0 0 26px}`
(build.mjs, chrome CSS) loses to `nav.pf-chrome.pf-chrome-top[data-pfs-head]{...margin:0...}` in
`VENTURE_CHROME_CSS` (site-nav.mjs), which has higher specificity. The gap under the band on tool
pages is whatever the venture's first element brings: 14 px on 72 of 80 sampled pages without bars,
16 on 3, 0 on 3. This run worked around it only for the bar pages. Fixing it for every page (drop
`margin:0` from the site-nav rule, or give it `0 0 Npx`) changes the first screen of ~1,900 pages.
Choose N by measuring the gap distribution first.

## Still weakest, and what I would do next

1. **The band margin above**, for all tool pages. Measure the gap on all pages (script pattern in
   this report), pick one value, and fix it at the source so the bar-page rule can go.
2. **Desktop layout shifts on 69 of 174 bid tools at 1280** (sum 0.95, unchanged by this run, not
   from the bars). Trace the sources with the observer from `polish-2026-11-12-header-first-paint.md`.
   That run measured the header shift gone, so something else moves: probably the quote panel or a
   font.
3. **Two stacked bars on rate pages.** "Your shop rates" and "Saved bids" are two rows with 12 px
   between them. One row (status text, then both buttons) would save about 45 px above the form on
   phones. Both bars hold their height from first paint, so a merge has to keep that.
4. Carried over: `.pager` defined twice in the writing STYLE; 190 posts with no related link; the
   ticker's third line at 320 px; browser checks in the nightly (control-plane PR).
