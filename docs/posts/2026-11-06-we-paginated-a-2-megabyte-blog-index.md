---
title: "We split a 2.3 MB blog index into 41 pages of 75 kB"
seo_title: "How to paginate a huge static blog index without losing search"
date: 2026-11-06
tags: [performance, site, static-sites]
description: "The writing index listed 2,484 posts on one page. Numbered pages cut it to 75 kB, and search still covers every post by fetching one JSON file on demand."
---

The blog index at `/writing/` listed every post on one page: 2,325 kB of HTML. The research index had 1,065 project cards in 1,441 kB. Both are linked from the main navigation, so they were the first pages many visitors opened.

The fix keeps the two things the old page did well. Everything is still a plain link, so a crawler or a reader without JavaScript can reach every post. And the search box, topic chips and tag menu still cover the whole archive.

**Blog.** The index is now 60 posts a page, in 41 numbered pages (`/writing/page/2/` and on). Every page lists every page number, so any post is two clicks from the first page. A page carries `rel="prev"` and `rel="next"` and its own canonical URL, and all of them are in the sitemap. The finder's script no longer has the whole list in the page. On the first search, filter or sort it fetches `cards.json` (one compact record per post) and works on that, showing the first 200 matches with a "Show more" button. The first page went from 2,325 kB to 75 kB. The Atom feed also listed all posts at 1.4 MB; it now carries the newest 100 at 54 kB, which is what a feed reader uses.

**Research.** Each of the 31 themes shows its first two projects, then a "Show all" button and a link to its topic page. Searching, or the button, fetches `more-cards.json` and adds the rest of the cards in place. The index went from 1,441 kB to 142 kB.

One thing is not done. The largest topic page, `research/topics/twins/`, is still 307 kB, and the 27 pages over the 150 kB budget now include the custom-development pages and the two inline-script-heavy hubs. The tests are in `platform/pages/writing.test.mjs`, and the page-weight tool is `node platform/pages/page-weight.mjs dist`. The numbers are from a local build; the live site could not be reached from this session, so no load time was measured.
