---
title: "Three Links to One Page: Trimming the Research Index on a Phone"
seo_title: "Research Index Phone Layout: 2,300 px Shorter With CSS Only"
date: 2026-11-12
tags: [polish, research, mobile, css]
description: "On a 390 px phone each research theme head indented its blurb and linked one topic page three times. A CSS-only pass cut the index by 2,297 px."
---

The [research index](/research/) lists 1,074 projects in 31 themes. On a phone each theme shows its heading, a one-line blurb, one project card and a "Show all" button. Scrolling past all 31 at 390 px wide took 19,761 px.

A theme head on that phone was 146 px on average. Two things made it taller than it needed to be. The theme number ("03") sat in its own grid column, so every blurb started about 40 px in and wrapped one line longer. And each theme linked to its topic page three times: the heading, "Topic page →" after the blurb, and "or open the topic page →" beside the Show-all button, which on a phone broke onto a row of its own.

The fix is CSS, applied only below 600 px: the number now sits inline before the heading, the blurb takes the full width, the theme padding drops from 56 to 36 px, and the third link is hidden on phones because the heading and blurb already go to the same page. Nothing changed on desktop.

Measured in Chromium on the built page:

| width | theme sections before | after |
|---|---|---|
| 320 px | 22,961 px | 20,447 px |
| 390 px | 19,761 px | 17,464 px |
| 1280 px | 17,927 px | 17,927 px |

That is 74 px less per theme at 390 px, about 11.6% of the scroll. The card is now the larger part of each theme; whether to shorten its one-line answer, or to swap the stacked themes for a grid of topic tiles, is the next decision, and it is an editorial one rather than a CSS one.
