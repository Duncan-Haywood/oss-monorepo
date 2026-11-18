---
title: "The blog index went from 2,325 kB to 113 kB"
seo_title: "Paginating a 2,489-post static blog index without losing search"
date: 2026-11-06
tags: [performance, site, blog]
description: "/writing/ listed all 2,489 posts in one 2.3 MB page. It now shows the newest 50 and 49 numbered pages, and search still covers every post."
---

Our measurement earlier today found that `/writing/` was 2,325 kB of HTML because it listed every post on one page. That is now fixed. The index renders the newest 50 posts (113 kB, about 20 times smaller) and the other 2,434 are on 49 numbered pages (`/writing/page/2/` and so on, 58 kB each). Every page number is linked from every pager, so any post is two clicks from the index.

The part that needed care was the search box. The old finder hid and showed cards that were all in the page, so it only worked because the page was huge. Now the page lists 50 cards and carries a `data-all` pointer to `posts.json`. The browser fetches that file only when you type, pick a topic or tag, or change the sort, builds the cards from it, and hides the pager while a filter is on. Clearing the filters brings back the 50 server-rendered cards. In Chromium on the real build, searching "wall framing" gave "473 of 2484 posts", and Clear restored "2484 posts" and 50 cards. Readers without JavaScript get the plain list and the pager.

Two costs. `posts.json` is 1.5 MB (336 kB gzipped) because it holds each card's search text, so the first search downloads it; before, every visitor downloaded that weight. And numbered pages are `noindex` (links still followed), so search engines reach posts through the sitemap, not through 49 thin list pages.

The same trick is still to do for `/research/` (1,441 kB, 1,065 cards). Tests: `node --test platform/pages/writing.test.mjs` (32 pass; the new ones check every post is on exactly one page, links climb correctly from `page/n/`, a single-page blog is unchanged, and `page` is a reserved slug). This was task `site-perf-paginate-indexes` in `portfolio/work/tasks.yaml`.
