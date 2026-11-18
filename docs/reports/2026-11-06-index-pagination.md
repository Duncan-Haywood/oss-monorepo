---
kind: analysis
date: 2026-11-06
tagged: auto
---
# Research index lazy-load (task `site-perf-paginate-indexes`, 2026-11-06)

`/writing/` was paged by a sibling run in PR #13480 and is not covered here.

Follow-up to `2026-11-06-site-performance-baseline.md`, finding 1.

## What changed

- `platform/pages/writing.mjs`: `renderIndex(posts, { page, perPage })` pages a section past
  `POSTS_PER_PAGE` (60). Page 1 is `writing/`, later pages `writing/page/N/`. Each page has a
  self canonical, `rel=prev/next`, and a pager listing every page number. `cards.json` (compact
  records) is written beside the index; the finder script fetches it on first interaction and shows
  up to 200 matches with "Show more". A section of 60 posts or fewer (the agents blog) is unchanged.
  The tag menu lists the 80 commonest tags on a paged index. `feed.xml` holds the newest 100 entries.
  `buildWriting` returns `page/N` slugs, so `renderHubSitemap` lists them with no change to build.mjs.
- `research/_homepage/build.py` + `template.html`: the index shows `INDEX_CARDS` (2) per theme; the
  rest are in `more-cards.json`, injected on search or on "Show all"; the topic page is the no-JS path.

## Numbers (local build, `page-weight.mjs`)

| Page | Before | After |
|---|---|---|
| `/writing/` | 2,325 kB | 75 kB (each of 41 pages 75 to 129 kB) |
| `/research/` | 1,441 kB | 142 kB (standalone builder run) |
| `writing/feed.xml` | 1,369 kB | 54 kB |

`check.mjs` on the full build: no dead links. Behaviour clicked in Chromium: search on `writing/page/2/`
loads cards.json and shows 65 of 2,484 for "sheathing", post links resolve (`../../slug/`),
`?topic=tools` on page 1 gives 1,878 posts (200 shown); research search finds 5 of 1,065; "Show all" adds
the rest. No page errors.

## Not done / next

- `research/topics/twins/` is 307 kB and other big topics are over budget: paginate topic pages.
- Without JavaScript only the visible page's posts can be searched; the numbered pages are the fallback.
- Live load time was not measured (the proxy blocks the site); do `site-perf-uptime-probe` first on a
  network that can reach it.
- The in-page `#<slug>` anchors for cards beyond the first two per theme only work after "Show all".
