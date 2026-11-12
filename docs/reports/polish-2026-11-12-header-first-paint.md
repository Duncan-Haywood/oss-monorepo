# Polish 2026-11-12: the tool-page header is full width from the first paint

**Why this item.** Item 1 of "Still weakest" in `polish-2026-11-12-bar-align.md`: every layout shift
traced on the tool pages came from `nav.pf-chrome.pf-chrome-top` going from the venture's column
(1,060 px at x = 110 on a 1,280 px window) to full width. The full-width `fit()` lived only in
`pf-site.js`, a classic script at the end of `<body>`, so the browser could paint the unfitted header
mid-parse and then move it. It is the first thing on all ~1,345 tool pages.

**How it was measured.** Full local build of main (`node platform/pages/build.mjs`, about 30 minutes
this run). A Node static server served `dist/` twice: as built ("before"), and with the new inline
script spliced in after the header's `</nav>` exactly as `injectChrome` now emits it ("after"), so
both runs read the same pages. Every eighth tool page carrying the venture header (169 pages), three
loads each, at 1,280 × 900 and 390 × 900, six tabs in parallel, pre-installed Chromium, third-party
requests blocked. A `layout-shift` PerformanceObserver (buffered, `hadRecentInput` excluded) read
500 ms after `load`; a shift counts as the header's when one of its sources is the `pf-chrome-top`
nav.

| | loads with any shift | loads where the header shifted | CLS sum | pages that shifted at least once |
|---|---|---|---|---|
| 1,280 px, before | 135 / 507 | 135 | 1.644 | 93 / 169 |
| 1,280 px, after | 1 / 507 | 0 | 0.017 | 1 (tax-lien-certificate-yield-calculator, not the header) |
| 390 px, before | 140 / 507 | 140 | 0.399 | 99 / 169 |
| 390 px, after | 0 / 507 | 0 | 0 | 0 |

At 390 px the shift was smaller (the header is already near full width) but just as frequent: the
`margin-top` that closes a body's top gap and the 16 px gutter offset both moved it.

Screenshots, with `pf-site.js` held back to show what the browser could paint before it ran
(water-heater-bid-calculator, 1,280 px):
`img/polish-2026-11-12-header-first-paint-before.png` (header boxed in the venture column, page
colour either side) and `img/polish-2026-11-12-header-first-paint-after.png` (full width).

## What changed

- `platform/pages/site-nav.mjs`: the palette pick and the fit are now two shared fragments
  (`CHROME_THEME_JS`, `CHROME_FIT_JS`). `VENTURE_CHROME_JS` is assembled from them and is the same
  2,449 characters as before. New `VENTURE_CHROME_EARLY_JS` runs both, once, on the header only: no
  listeners, no footer.
- `platform/pages/build.mjs` (`injectChrome`): emits `<script>…</script>` straight after the header
  (about 2 KB per tool page, parsed once by `check.mjs` since every copy is identical). `rates.mjs`
  and `jobs.mjs` still anchor on the `<nav>…</nav>` and insert after it, so their bars go between the
  header and the script, which is harmless: the script finds the nav by class.
- The selector is `nav.pf-chrome.pf-chrome-top`, not the `data-pfs-head` marker: tests count headers
  by that marker string, and the first version failed "every page type carries the one site header"
  with 2 markers.
- A dark venture now gets the dark header before the first paint as well; before, it flashed light.

Tests: `site-nav.test.mjs` (the early script carries the identical `fit()` text, has no footer or
listeners, parses, no-ops on a stub), `build.test.mjs` (the script follows the header directly, runs
before the venture markup, one marker), and `venture-chrome-early.test.mjs` (Chromium: without it
the header is 780 px wide when the next script runs; with it, 0/full width, padding equal to the
venture column's left so the bar text does not move, dark theme set early, phone unchanged).

## Still weakest, and what I would do next

1. **A scrollbar that appears later.** On a desktop with classic scrollbars the inline fit measures
   before the page is tall enough to scroll; the `load` re-run then narrows the header by the
   scrollbar's width. Headless Chromium here has overlay scrollbars, so this run could not see it.
   Measure on a classic-scrollbar setup (Chromium `--disable-features=OverlayScrollbar` or Windows)
   before acting; `scrollbar-gutter: stable` on `html` would be the CSS fix, but it changes every page.
2. **tax-lien-certificate-yield-calculator** shifted once in 507 loads after the change, not from the
   header. Trace its source with the same observer.
3. Carried over from `polish-2026-11-12-bar-align.md`: the shop-rates and saved-bids bars sit above
   the `h1`, so a visitor's first line is "Save your rates once"; the ticker's third line at 320 px;
   1,000 to 1,100 px sideways sweep; browser checks in the nightly (control-plane PR).
