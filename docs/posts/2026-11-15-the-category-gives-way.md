---
title: "On a phone, 93% of tool breadcrumbs cut off the tool's own name"
seo_title: "Breadcrumbs on mobile: let the category shrink, not the page name"
date: 2026-11-15
tags: [polish, design, platform]
description: "At 390 px, 1,272 of 1,365 tool pages showed 'Home › long category › Actions Ch…'. The category now shrinks first, and 1,305 names fit."
---

Every tool page on the site has a breadcrumb under the header: Home › category › tool. On a phone it is one line, and the tool's name is the part that got cut. On a 390 px screen it read like this:

> Home › CI checks & developer gates › Actions Ch…

The category kept its full width and the name got what was left. Categories on this site are long ("Compliance checks & evidence records" is 36 characters), so what was left was usually about a dozen characters. Across all 1,365 tool pages, measured in a headless browser at 390 px, 93 names fitted and 1,272 were cut. The median name showed 13 characters. At 360 px, 62 trails did not fit even with no name at all and ran off the edge of the screen.

That is the wrong way round. The last crumb is the page you are on, and it is the one part of the trail a visitor reads to check they landed where they meant to. The category is context; it can lose its tail.

## What changed

Now the category gives way first. On a phone it shrinks, down to about five characters and an ellipsis, before the name loses a letter. "Home ›" is hidden there too when a category follows it, since the logo next to it already goes home:

> CI checks & … › Actions Checkout Credentials Check

| at 390 px, 1,365 tool pages | before | after |
|---|---|---|
| tool name shown in full | 93 | 1,305 |
| median characters of the name visible | 13 | 29 |
| median characters of the category visible | 28 | 22 |

At 360 px, full names went from 33 to 1,184, and no trail runs off the edge. The row is still one line, 28 px high. Wide screens are unchanged.

The same rule covers research project pages (Research › topic › project title), where topic names like "Proper scoring & elicitation" were taking the room from the question the page answers. Across 1,080 of those pages, 183 trails ran off the screen and the median page showed 7 characters of its title; now none run off and the median is 33. Titles there are whole questions, so most are still cut, but you see the start of the question rather than "Wh…".

## Two details

Short crumbs such as "Tools" are left alone. The first version gave every middle crumb a minimum width, and on the comparison pages that stretched "Tools" and left a gap before the next arrow.

The other was a fraction of a pixel. CSS flexbox shares a shortfall between items in proportion to how much each may shrink times its width. With the category set to shrink 1,000 times as readily as the name, the name still lost about a tenth of a pixel, and the browser drew an ellipsis on a name that otherwise fitted: "Actions Checkout Credentials Che…". The ratio is now 100,000 to 1.

The 60 names still cut at 390 px are long ones, such as "BAI2 to OFX, QBO, QIF and Xero CSV Converter". They now show about 30 characters instead of about 10.

The change is in `platform/pages/site-nav.mjs`; the measurements and the next things to fix are in `docs/reports/polish-2026-11-15-crumb-gives-way.md`.
