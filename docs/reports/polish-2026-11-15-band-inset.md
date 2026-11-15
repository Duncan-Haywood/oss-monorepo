---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: the site band keeps a gutter on tools that pad `main`, not `body`

Track: polish/0. Picked from `polish-2026-11-15-crumb-gives-way.md`, "Still weakest" item 1
(61 tool pages have no left gutter at 390 px). The band is the first thing on every tool page,
and one shared component draws it. Searched open PRs (`polish`, `gutter`, `band`): none.

## What was wrong

The site band is inserted as the venture body's first child, so its rows start where the body's
content box does. On tool pages the rows have no side padding (`.pf-chrome-top .pfs-bar{padding:12px 0}`):
the venture's body padding is the gutter. 61 tools pad `main` or a wrapper instead and leave
`body { margin: 0 }`, so on a phone the brand, the Search pill and the breadcrumb touched both
screen edges while the tool's own `h1` sat 16 to 20 px in. At desktop width the band row is a
centred 1,120 px column, so it looked fine there and nobody saw it.

## What changed (`platform/pages/build.mjs`)

- `bodySidePadded(html, css)`: true when the venture's CSS gives `body` (`body`, `html body`, or
  the bare-tool base style's `:where(body)`) a non-zero left padding (shorthand, `padding-left`,
  `padding-inline`, `padding-inline-start`) at any width. It reads inline `<style>` blocks plus the
  stylesheets the page links from its own folder (`ownStylesheets`, cached per tool).
- `injectChrome` marks the band `data-pfs-inset` when that is false (new `linkedCss` option;
  `addSiteChrome` passes it).
- `renderChromeStyle`: `.pf-chrome-top[data-pfs-inset] :is(.pfs-bar,.pfs-crumbs)` gets
  `padding-inline: clamp(0px, calc(576px - 50%), 16px)`: 16 px while the band is under 1,152 px,
  tapering to 0 above, so the desktop row does not move.
- `bodyTopPadded` shares the declaration reader (`bodyPaddingDecls`) and keeps its old selector
  set (`body`, `html body`), so `data-pfs-gap` is unchanged.
- Tests: `platform/pages/band-inset.test.mjs` (detector cases, the mark, the CSS rule and its order).

## Measured

Static detector against the browser (before build, 1,366 tool entry pages at 390 px): it marks
exactly the 61 pages whose brand sat under 8 px from the edge, and none of the other 1,305. The
first draft read only `body {}` in inline styles and also marked 102 pages padded through
`:where(body)` or a linked `style.css`; reading both closed that.

Playwright, production build before and after, every tool entry page:

| | before | after |
|---|---|---|
| brand under 8 px from the left edge, 390 px | 61 | 0 |
| brand under 8 px from the left edge, 360 px | (not run) | 0 |
| marked pages: brand left / Search right gutter, 390 px | 0 / 0 px | 16 / 16 px |
| marked pages whose brand lines up with their `h1` (within 4 px), 390 px | 0 of 61 | 60 of 61 |
| unmarked pages whose brand, crumb or Search moved (390 and 1,280 px) | | 0 |
| marked pages, brand left at 1,280 px | 80 px | 80 px |

`node --test 'platform/pages/*.test.mjs'`: 1,693 tests, 1,667 pass, 26 skipped, 0 fail.
`node platform/pages/check.mjs`: "looks publishable: 1366 products, 45 category pages, 10076 pages,
no dead links."

Screenshots at 390 px: `docs/reports/img/polish-band-inset-{before,after}-1099-vendor-tracker-390.png`
and `...-agent-workroom-390.png`.

## Still weakest, and what I would do next

1. **87 tool pages at 1,280 px have a band column that does not line up with the tool's column**
   (brand at 80 px, `h1` anywhere from 16 to 280 px: `agentic-trading-lab` 226, `catholic-shorts`
   276, `assembly-line-balancer` 50). The band always uses the 1,120 px column; the tools use 720 to
   1,200. Reading the venture's main column width (`main { max-width }`) the way
   `bodySidePadded` reads padding, and setting the band's max-width to match, would line them up.
   Check first whether that looks better: a site-wide band at a constant width is also a defensible
   choice.
2. Five pages at 390 px still have a brand 16 to 32 px off their `h1` (`tender-bid-readiness`
   32/64, `cam-reconciliation-check` 12/34): body padding plus a padded wrapper. Minor.
3. Carried over: the podcast row has no edge fade; a sweep check for crushed controls in nowrap
   rows; research project titles still cut on a phone; Tools and projects about half the blog.
