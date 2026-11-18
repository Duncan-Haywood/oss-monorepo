---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: the venture header gets a 16px gutter where the host has none

Track: polish/0. Picked from `polish-2026-11-15-crumb-gives-way.md`, "Still weakest" item 1
(61 tool pages have no left gutter at 390 px). Searched open PRs for `polish` and `gutter`: none
on this.

## What was wrong

`.pf-chrome-top .pfs-bar{padding:12px 0}` (`platform/pages/build.mjs`, the full-width band rules)
zeroes the bar's side padding because the venture's body padding is meant to inset it, and
`CHROME_FIT_JS` (`site-nav.mjs`) turns that inset into nav padding when it stretches the band.
Tools that pad `<main>` instead of `<body>` (e.g. `1099-vendor-tracker`: `main{padding:36px 20px}`)
have a band that already fills the window, so `fit()` returned early and the brand, nav and
trail started at x = 0. Found with CDP `CSS.getMatchedStylesForNode` on `.pfs-bar`.

## What changed (`platform/pages/site-nav.mjs`, `CHROME_FIT_JS`)

- For the header (`NAV` only, not the footer aside), a computed side inset under 8 px becomes
  16 px. In the early-return branch (band already full width) the padding is now set too.
- Test: `site-nav.test.mjs`, "a venture header that already fills a phone gets a 16px gutter"
  (stub rect follows the styles it sets): flush nav gets 16/16, aside unchanged, inset host kept.

## Measured (full production build, Playwright 390x800, every tool entry page, JS on)

| | before | after |
|---|---|---|
| tool pages measured | 1,351 | 1,351 |
| `.pfs-brand` left < 8 px | 49 | 0 |
| brand moved | | 49 (0 → 16 px), no other page |
| `scrollWidth` > 390 | 0 | 0 |
| brand left histogram after | | 12:3, 14:3, 16:589, 18:198, 24:33, 28:524, 32:1 |

The earlier report counted 61 with a looser rule (under 8 px on brand, nav or trail, with an
earlier build); this run's census found 49, all fixed. Desktop 1,280 px: brand at x = 80 on
`1099-vendor-tracker` and `saints-by-candlelight` (bar centred at 1,120 px), no sideways scroll.
Screenshots: `docs/reports/img/polish-header-gutter-{before,after}-{1099-vendor-tracker,saints-by-candlelight}-390.png`
("before" is the after build with the nav's inline padding set back to 0, which is exactly the
old state).

## Still weakest, and what I would do next

1. **No-JS fallback**: with JavaScript off the 49 still start at x = 0. A build-time mark
   (detect body without side padding, like `bodyTopPadded`) could set the padding in CSS.
2. **On desktop the band's bar is centred at 1,120 px while tool content uses its own column**
   (brand x = 80, h1 x = 110 or 276): the brand and the content's left edge disagree on most
   tools at 1,280 px. Aligning the bar to the host's main column would make the header feel
   part of each tool.
3. Carried over: podcast chip row has no edge fade; research project titles still cut on a phone;
   `cardName` vs `toolName` disagreement; Tools and projects is about half the blog.
