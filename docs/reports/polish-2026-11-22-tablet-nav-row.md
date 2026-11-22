---
kind: polish
topics: [design]
date: 2026-11-22
---
# Polish 2026-11-22: the header's link row stops wrapping at tablet width, and the page's own tab starts in view

Not on any earlier "still weakest" list. Found by screenshotting the hub, a flagship, the research
index, Stories, the blog index and a post at 390 and 1280 px (all fine), then measuring the shared
header across widths, where 768 px (iPad portrait) broke.

## What was wrong

Between phone width (the `max-width:720px` rule, one scrolling row) and the 960 px one-row
desktop header, the header uses two rows: brand and Search, then the ten section links on a row of
their own. The links need about 721 px. A site page's bar has 16 px gutters and a tool page's bar
is inset by the tool's own gutter (16 to 32 px), so the links row wrapped and "About" sat alone on
a third row:

| width | site pages (blog, about, categories) | tool pages (1,406) |
|---|---|---|
| 721 to 752 px | wrap (bar 117 px instead of 82) | all wrap |
| 744 px (iPad mini) | wrap | 1,406 of 1,406 wrap (bar 123 px instead of 88) |
| 768 px (iPad portrait) | fit | 1,103 of 1,406 wrap |
| 820 px (iPad Air) | fit | 0 wrap |

Measured with Playwright on the full build (`.pfs-nav` height > 40 px), every venture page.
Second, smaller defect: on a phone the row always starts at the left, so on the Updates, Ask, Get
it built, Deploy your own and About pages the current tab was off-screen or under the fade.

## What changed (`platform/pages/site-nav.mjs`, `SITE_HEADER_CSS`)

1. Inside `@supports (animation-timeline:scroll())` and `@container pfs-head (max-width:959px)`,
   the links row is one line that scrolls (`flex-wrap:nowrap; overflow-x:auto`), as on a phone.
   Its tail fade starts at **0** and a scroll timeline animates it from 28 px to 0
   (`pfs-fade-tail`). A scroll timeline on a box that does not overflow is inactive, so a row that
   fits draws no fade at all (verified: `--pfs-fade` 0 px at 768 px on site pages, where the row
   fits; 23.8 px at 744 px on a tool page, where it overflows by 34 px). Browsers without scroll
   timelines keep the old wrap, which hides nothing.
2. A head fade, `--pfs-fade-l`, registered at 0 and animated to 28 px over the first 40 px of
   scroll, on this row and the phone row: once a link is scrolled off the left it fades rather
   than being cut hard.
3. `a[aria-current="page"]{scroll-initial-target:nearest;scroll-snap-align:center}`: the page's
   own tab starts centred. No script; browsers without the property start at the left, as before.
   Chromium 157 here: Updates at 390 px moved from x 356–416 (half off a 374 px row) to 165–225;
   About from 712–756 (off-screen) to 302–346. Tool pages (current tab "Tools", first) keep
   `scrollLeft` 0. The window does not scroll (`scrollY` 0 on every page tried).
4. `padding-block:4px; margin-block:-4px` on the scrolling row, so a focused link's 2 px outline
   at 2 px offset is not clipped by the scroller. Net layout change 0 px (bar 78 px at 390 before
   and after).
5. `site-nav.test.mjs`: a test that the band rule, the zero-start fade, the centred current tab
   and the zero-start head fade stay in the stylesheet.

Before and after: `docs/reports/img/polish-2026-11-22-tablet-nav-*-{before,after}.png`
(tool page at 768, About at 744, Updates at 390).

## Measured

- `--only` preview of three tools plus every site page vs the full build of `main`, Chromium 157,
  widths 390, 721, 744, 768, 1024, 1280: header bar at 721–768 px is 82 px (site) / 88 px (tool)
  after, against 117 / 123 before. 390 and 1024+ unchanged (same bar heights, same nav heights).
- `node --test platform/pages/site-nav.test.mjs`: 25/25. Full `platform/pages/*.test.mjs` run:
  see the run record's notes.
- Not measured: Safari and Firefox (no browsers here). Safari 26 and Firefox lack
  `scroll-initial-target`; Firefox lacks scroll timelines and keeps the wrap.

## Still weakest, and what I would do next

1. **Tool-page header is 115 px on a phone against 106 on site pages with a breadcrumb**:
   `.pf-chrome-top .pfs-bar{padding:12px 0}` (build.mjs, the venture chrome) overrides the phone
   rule's 9 px, and the trail has 10 px under it against 9. Matching the site would lift every tool's
   first field by 7 px; the fold baseline has 16 pages within 7 px of the line (829 to 835).
2. **The venture-fold baseline** (`venture-fold.mjs --check` on this run's full build) has 311 pages
   below the fold, 155 of them within 72 px; `package-exports-drift-check` now passes and can be
   dropped with `--write-baseline` on the next full build.
3. **Browser check**: a `browser_checks.py` sweep at 744 px that fails when `.pfs-nav` is taller than
   one link would catch a wrap from a new nav item. Today the test only checks the CSS text.
