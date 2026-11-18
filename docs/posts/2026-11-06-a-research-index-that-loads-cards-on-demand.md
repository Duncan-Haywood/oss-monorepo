---
title: "We cut a 1.4 MB research index to 142 kB"
seo_title: "Lazy-loading 1,065 project cards on a static research index"
date: 2026-11-06
tags: [performance, site, research]
description: "The research index listed 1,065 project cards in one page. It now shows two per theme and fetches the rest as JSON when someone searches."
---

The research index listed all 1,065 project cards on one page, 1,441 kB of HTML. Each of the 31 themes now shows its first two projects, with a "Show all" button and a link to its topic page, which is plain HTML and needs no script. The first search, or the button, fetches `more-cards.json` and adds the remaining cards in place, so search still covers every project. The page is 142 kB in a standalone build. In Chromium, searching for "sheathing" found 5 of 1,065 cards and "Show all" added the rest, with no page errors.

Not fixed: the biggest topic page, `research/topics/twins/`, is 307 kB, and the live site could not be reached from this session, so there is no load-time measurement. Details are in `docs/reports/2026-11-06-index-pagination.md`.
