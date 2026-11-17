---
kind: polish
topics: [design]
date: 2026-11-16
---
# Polish 2026-11-16: one header row on 834 more tool pages

Track: polish/0. Not from a "Still weakest" list. Of the recent ones, tool project ledes have
already landed (`ventureLede`), and long tool ledes are in open PR #16673. I built the site and
screenshotted the hub and flagships 2 to 8 at 390 and 1,280 px. Changepoint Detector and Shift
Roster Builder showed the site header on two rows at 1,280 px while the others had one, so I
measured every tool page.

## Measured (full build, `python3 -m http.server`, Playwright, scripts on, `load`)

Measured on `.pfs-bar` content width and height. "Two-row" means the nav's top is below the
brand's bottom. 1,388 pages carry the header.

| | before | after |
|---|---|---|
| two-row at 1,280 px | 885 (bar width 1,000: 759; 980: 65; 900: 28; 960: 10; ...) | 51 (widths 736 to 948) |
| two-row at 1,024 px | 1,388 | 51 |
| bar height at 1,280 px | 57 (488), 88 (885), 56 (15) | 57 (1,322), 88 (51), 56 (15) |

Part widths, Inter 15 px: brand 153, links 722, Search pill 98. Liberation Sans (Arial metrics)
comes within 4 px of those. DejaVu Sans (Linux without Inter) is about 12% wider and already
wrapped at 1,120 before this change. Measuring note: reading at `domcontentloaded` gives
unstyled heights (20 px) on most pages, so wait for `load`.

Screenshots: `img/polish-2026-11-16-header-row-{before,after}-1280.png` (Changepoint Detector)
and `img/polish-2026-11-16-header-row-{before,after}-hub-1024.png`.

## What changed (`platform/pages/site-nav.mjs`)

- `SITE_HEADER_CSS`: two rows only at `@container pfs-head (max-width:959px)` (was 1,017).
  New band `(min-width:960px) and (max-width:1017px)`: bar column gap 18, nav gap 14, form hidden,
  Search pill drawn as its glass alone at 35 px (`font-size:0`, so "Search" stays the accessible
  name).
- `VENTURE_CHROME_CSS` repeats the pill's padding and font-size inside the band, because its
  `nav.pf-chrome.pf-chrome-top[data-pfs-head] a{font:inherit}` and `.pfs-searchlink{padding}`
  outrank the shared rule. The first try showed the word beside the glass on tool pages.
- `site-nav.test.mjs`: width budgets for the full row (≤ band top) and the compact row
  (≤ band bottom), and the venture override is present.

## Still weakest, and what I would do next

1. **The 51 narrow-column tool pages** (28 at 900 px) still get two rows. A third band (nav gap 12,
   brand mark only) would cover about 900 px. Check each one first, because the brand name is
   the site's only identity on a tool page.
2. **ShootFlow (flagship 7) at 1,280 px** is a text-wall docs page: "What exists today" is a
   bullet list with command lines inline and no screenshot or try-it control. It's the weakest
   flagship surface I saw.
3. Carried over: the hub's empty right margin from 980 to 1,180 px; 401 research and 409 tool
   posts that name no project; the 51 two-row pages above.
