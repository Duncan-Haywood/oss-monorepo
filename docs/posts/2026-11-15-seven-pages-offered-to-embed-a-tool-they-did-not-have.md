---
title: "Seven pages offered to embed a tool they did not have"
seo_title: "Why seven product pages stopped offering 'Embed this tool'"
date: 2026-11-15
tags: [polish, site-build, embed, shootflow]
description: "The site build put an 'Embed this tool on your page' box on 1,368 entry pages. Seven had no tool on them. The box now needs a control to embed."
---

Every tool on this site ends with a small box: "Embed this tool on your page". Open it and you get an `<iframe>` snippet to paste into your own site. The text promises that "the calculator runs in the visitor's browser" and keeps the same disclaimer as the page.

The build added that box to every product's front page: 1,368 of them on today's build. Seven of those pages have no calculator. They are documentation or product pages:

- [ShootFlow](/photo-editing/), a desktop photo pipeline whose page is a guide
- the [World Traveler](/garmin-world-traveler-watchface/) Garmin watch face
- the [self-hosted SaaS stack](/self-hosted-saas-stack/) list
- [Quick Pick](/quick-pick-survey/), [Photos Import Tools](/photos-import-tools/) and [Vendor Watch](/vendor-watch/), which run on your own machine or server
- the [AI Engineering Academy](/ai-engineering-academy/) hub, a list of calculators rather than one

Someone who pasted the snippet from one of these would have framed a brochure on their site, under a promise about a calculator.

## The rule now

The box goes on a page only if the page has a field, a button, a drop-down or a drawing surface of its own. Two things don't count: the site's search form and the embed box itself. Tag names quoted inside a script, like a FAQ answer in structured data, don't count either. Earlier today the "needs JavaScript" banner got the same kind of fix, and both checks now share one list of the site's own controls.

| | before | after |
|---|---|---|
| entry pages with the embed box | 1,368 | 1,361 |
| pages with the box and nothing to embed | 7 | 0 |

## A miscount found on the way

The build log said "Carried saved shop rates into 1,369 bid calculator page(s)". There are about 125 bid calculators. The counter compared each page with its state before the embed box was added, so every page that got the box counted as "rated" too. It now compares with the state just before the rates step and reads 125.

After a full rebuild the site check passes (10,284 pages, no dead links), and all 1,679 site-build tests pass.
