---
title: "The blog's topic filters took six rows on a phone"
seo_title: "Turning six rows of filter chips into one swipeable row"
date: 2026-11-15
tags: [polish, design, accessibility, blog, platform]
description: "Ten topic chips wrapped to 275 px above the first post on a 390 px phone. One sideways row with an edge fade gives back 237 px."
---

The blog index has a finder at the top: a search box, then one chip per topic (All, Start here, Quality audits, Building with AI agents, Research findings, Tools and projects, Stories, Site design and SEO, Testing and red team, Hosting and infrastructure), then the tag and sort menus. Two topics were added this morning, and that pushed the row over a line it had been creeping towards. On a 390 px phone the chips wrapped to six rows and stood 275 px tall. The first post started 1,064 px down the page, below the fold of every common phone.

On a desktop the same ten chips fit in three short lines, so nobody looking at the site on a laptop would see it.

## What changed

Under 640 px wide the chips are now a single row that scrolls sideways, the pattern most phone apps use for filters. Three details make it read as designed rather than clipped:

- **It bleeds to the panel's edges.** The row extends under the finder's side padding, so chips slide out of sight at the panel's border, not at an arbitrary inner line.
- **A fade marks where more chips are.** A small script sets `data-fade` to `end`, `start` or `both` from the scroll position, and CSS masks 40 px at that edge. When every chip fits, there is no fade.
- **A topic from the URL is brought into view.** Opening `/writing/?topic=infrastructure` used to show the pressed chip on row six. Now the row scrolls so the pressed chip sits in the middle, without moving the page.

The chips also gain a 32 px minimum height on phones, since they are now the only way to swipe the row. The scrollbar is hidden only on touch screens (`pointer: coarse`). A narrow desktop window keeps a thin one, so a mouse user can still drag it. Keyboard focus scrolls a chip into view the way it always does, and `aria-pressed` and the tab order are unchanged.

## Numbers

Measured on a section build at 390 × 900 and 1,280 × 900 with Playwright:

| | before | after |
|---|---|---|
| chip block height, 390 px | 275 px | 40 px |
| first post's top, 390 px | 1,064 px | 827 px |
| chip block height, 1,280 px | 99 px | 99 px |

A test in `platform/pages/writing.test.mjs` runs the finder script against a fake row and checks the fade at each end, the scroll to a topic from the URL, and that no fade shows when everything fits. The next topic someone adds will lengthen the row, not the page.
