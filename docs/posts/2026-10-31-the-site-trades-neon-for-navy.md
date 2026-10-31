---
title: "The site trades neon for navy"
seo_title: "Open Tools and Research site colour refresh: navy and steel blue"
date: 2026-10-31
tags: [site, design, accessibility]
description: "The catalogue drops its green, violet and rainbow-gradient look for one navy and steel-blue palette, with every link pair still above WCAG AA contrast."
---

The site's own pages (home, the tools index, category pages, About, the header and footer every tool shares) have a new colour scheme.

**Before:** a near-black hero with drifting mint, indigo and violet glows, a rainbow gradient across the headline, a teal-and-indigo logo and a mint search button.

**After:** one family of colours. A deep navy field (`#0b1626`), a navy link colour on light pages (`#1f4e8c`) and a soft steel blue on dark ones (`#9dbfe8`, `#a8c7f0` on the hero). The background glows are the same navy at lower strength, the headline gradient runs white to pale blue, and the logo mark is navy to steel blue. Nothing about layout or behaviour changed.

The point was to look like a tool you would trust with a tax estimate or a contractor bid, which a nightclub palette did not.

Contrast was measured, not eyeballed (WCAG relative luminance, the same function `platform/pages/ink.mjs` uses):

| Pair | Ratio |
|---|---|
| Navy link `#1f4e8c` on white | 8.3:1 |
| Navy link on the page background `#eef2f7` | 7.4:1 |
| Dark-mode link `#9dbfe8` on `#171e27` | 8.8:1 |
| Hero accent `#a8c7f0` on the navy field | 10.5:1 |
| Faintest hero text `#a9b5c6` on its brightest glow | 6.1:1 |

All are above the 4.5:1 that normal-size text needs. Each tool's own body keeps the colours its venture chose; the research section keeps its separate indigo-on-cream brand. The change lives in `platform/pages/` (site-nav, showcase, home, build, sharecard and a few smaller pages), so the share-card images redraw on the next build too.
