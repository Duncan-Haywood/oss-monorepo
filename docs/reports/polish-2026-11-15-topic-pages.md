---
kind: polish
topics: [seo]
date: 2026-11-15
---
# Polish 2026-11-15: a crawlable page for each blog topic

Track: polish/0. Picked from `polish-2026-11-15-blog-stories-topic.md`, "Still weakest" item 2 (a
page per topic, `writing/topic/<id>/`, instead of a query string only the script reads). The
newest report's item 1 (61 tool pages with no left gutter) is already PR #16233, open when this
run started. Searched open PRs for `polish`, `topic`, `gutter`, `fade`, `crumb`: nothing else on
this.

## What was wrong

- The blog's topic filter was the finder's chip row: `<button>`s inside a form that is `hidden`
  until `FINDER_SCRIPT` runs. Without JavaScript there were no topic links on the index at all.
- A post's topic pill and its "More in …" link went to `writing/?topic=<id>`. That URL is the
  blog index (same title, same description, canonical `writing/`), so no topic had a page that
  could rank or that an answer engine could cite as "the research posts".

## What changed (`platform/pages/writing.mjs`)

- `TOPICS` entries carry `seo`, a search-result title per topic (tested: every one fits
  `TITLE_BUDGET`, every blurb fits 160 characters).
- `renderTopicPage(posts, id, { page })` writes `writing/topic/<id>/` (newest `PAGE_SIZE` posts)
  and `…/page/<n>/` (`noindex`, like the blog's numbered pages). Meta description is the blurb
  plus "N posts, newest first." when that fits 160 characters, else the blurb. JSON-LD:
  `CollectionPage` with an `ItemList` of the page's posts, plus `BreadcrumbList`. Cards on a topic
  page drop the topic pill (`renderCards(..., { topicPill: false })`).
- `renderTopicNav` is a plain `<nav class="topic-nav">` link list with counts, at the end of the
  blog index ("Browse by topic") and of every topic page ("Other topics", current topic marked
  `aria-current`). It wraps, because it sits below the list rather than above it.
- Post pages on the people's blog link the topic page; the agent-to-agent blog has no topic pages
  and keeps `?topic=`.
- `buildWriting` returns `topic/<id>` for every topic with a post, so `renderHubSitemap` lists
  them. `topic` is a reserved post slug.
- Tests (`writing.test.mjs`): topic pages, pager and noindex, sitemap slugs, nav links, the
  reserved slug, title and description budgets; two existing slug lists and the topic-link
  assertion updated.

## Measured

Section build (`node platform/pages/writing.mjs`), 4,863 posts:

| | before | after |
|---|---|---|
| Topic pages a crawler can reach | 0 | 9 indexable + 92 `noindex` numbered |
| Sitemap URLs under `writing/topic/` | 0 | 9 |
| Topic links on the blog index without JS | 0 | 9 |
| Sideways scroll at 390 px (index, research, stories, tools p3) | none | none |
| `h1` per page | 1 | 1 |
| Topic nav height | n/a | 329 px at 390 px, 169 px at 1,280 px |

Screenshots: `docs/reports/img/polish-topic-page-390.png`, `polish-topic-nav-1280.png`.

## Still weakest, and what I would do next

1. **Tools and projects is still 2,524 of 4,863 posts (52%).** Its topic page is 51 pages long.
   Sub-grouping by venture (each venture's posts already share a tag) would give
   `writing/topic/tools/` something better than a date list: a short "by project" index at the top.
2. **Topic pages are not on the hub or the site nav.** They are reached from the blog and from posts.
   Once Search Console (or any measurement) exists, check whether they are indexed before adding
   more links.
3. **The blog index's numbered-pages pager is 98 links long at 1,280 px** (five rows of numbers).
   A windowed pager (first, last, ±3 around the current page) would read better on the blog and on
   the long topics.
4. Carried over: the podcast row has no edge fade; research project titles cut on a phone;
   `cardName`/`toolName` disagree (`polish-2026-11-15-related-names.md`).
