---
title: "The site header took two rows on 885 of 1,388 tool pages at desktop width; now it takes one"
seo_title: "A container query kept a site header to one row on 834 more pages"
date: 2026-11-16
tags: [polish, design, css, container-queries]
description: "Tool pages put the shared header in a 900 to 1,000 px column, too narrow for one row, so it broke onto two. Drawing Search as a glass fixed 834 of them."
---

Every page on the site carries the same header: the brand, ten section
links and a Search pill. On the hub it sits in a 1,120 px column. On a tool
page it sits in whatever column the tool gives its body, and most tools use a
narrower one.

The header sets its layout with a container query on its own width, not
the window's. With all its parts in one row it needs about 1,016 px: 153 for
the brand, 721 for the links, 44 for the gaps and 98 for the pill. Below
1,017 px the query moved the links onto their own row, which is a tidy
layout, but a taller one.

I measured every built tool page in Chromium at 1,280 px, the commonest
laptop width. **885 of 1,388 (64%) had the two-row header**, 31 px taller
than on the pages beside them. 759 of those headers were exactly 1,000 px
wide and 65 were 980. Changepoint Detector and Shift Roster Builder, both
flagships, were two of them. Going from the hub to a tool, the nav jumped
down a line.

## The fix

A 1,000 px column misses the full row by only 16 px. So there is now a band
between the old breakpoint and the full row. From 960 to 1,017 px the Search
pill shows only its magnifying glass, 35 px instead of 98, and the gaps
close a little (links 16 to 14 px apart, bar 22 to 18). That row needs about
929 px. Below 960 px the two-row layout stays.

The word "Search" isn't removed. It's set at `font-size:0`, so it's still
the link's accessible name.

The first try showed the word next to the glass on tool pages. Tool pages
load an extra chrome stylesheet, and its rule
`nav.pf-chrome.pf-chrome-top[data-pfs-head] a{font:inherit}` outranks the
shared one. That stylesheet repeats the band now, and a test checks it does.

## Measured

Same build, same 1,388 tool pages, Chromium, before and after:

| | before | after |
|---|---|---|
| Two-row header at 1,280 px | 885 | 51 |
| Two-row header at 1,024 px | 1,388 | 51 |
| Header bar heights at 1,280 px | 57 px (488 pages), 88 px (885) | 57 px (1,322), 88 px (51) |

The 51 left have columns of 736 to 948 px, too narrow even for the compact
row. They keep the two-row layout. The width budget is measured with Inter,
which the site uses when it's installed and which sets about as wide as
Arial. macOS and Windows system fonts set narrower, so they fit with more
room.

The code is in `platform/pages/site-nav.mjs`. `site-nav.test.mjs` checks the
width budget of each layout against its breakpoint, so a new nav link that
would break the row fails the test.
