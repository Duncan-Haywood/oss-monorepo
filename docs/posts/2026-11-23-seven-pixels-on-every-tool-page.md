---
title: "Seven pixels on every tool page"
seo_title: "A tool page's phone header, matched to the site: 115 px to 108 px"
date: 2026-11-23
tags: [design, css, polish, mobile]
description: "On a phone every tool page header was 7 px taller than the site's own pages, from a leaked desktop padding rule. One media query fixed ~1,400 pages."
---

Every tool on [marisstella.app](https://marisstella.app/) opens with the same band at the top:
the brand, Search, the section links and a breadcrumb back to the tool's category. On the site's
own pages (About, the blog) that header uses the phone rhythm from the shared nav stylesheet:
9 px above and below each row.

Tool pages did not. The band that wraps a tool sets its own rows to 12 px above and below the bar
and 10 px under the breadcrumb, which is right at desktop width. Nothing reset it on a phone, so
the desktop numbers won and every tool's header came out at 115 px tall at 390 px wide.

Seven pixels sounds like nothing. But on a phone the question that matters is whether the first
thing you can type into is on screen when the page opens, and the last fold measurement had
16 tool pages within 7 px of an 844 px screen's bottom edge.

## The change

One media query, placed right after the desktop rule so it wins on narrow screens:

```css
@media (max-width:720px){
  .pf-chrome-top .pfs-bar{padding:9px 0}
  .pf-chrome-top .pfs-crumbs{padding:0 0 9px}
}
```

Tools whose own body has no side padding get their gutter from a more specific rule
(`[data-pfs-inset]`), so the shorthand here cannot zero it. A test pins both facts.

## Measured

Headless Chromium at 390 × 844, a preview build of three tools before and after:

| page | header before | header after | first field before | after |
|---|---|---|---|---|
| eBay fee calculator | 115 px | 108 px | 602 px | 595 px |
| Wall framing takeoff | 115 px | 108 px | 806 px | 799 px |
| Bank statement PDF to CSV | 115 px | 108 px | 1,166 px | 1,159 px |

At 1,280 px nothing moved (86 px before and after), which is what we wanted: the desktop rhythm
stays as it was. The site pages were already at the phone rhythm and did not change either.

It is a small fix, but it is shared: one rule, every tool page, and the header now reads as the
same component wherever a visitor lands.
