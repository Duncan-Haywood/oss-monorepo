---
kind: polish
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: the blog and research indexes are one huge page each

**Measured** (full local build, Chromium at 390 px, 2026-11-03):

| page | HTML size | scroll height at 390 px | h1 | sideways scroll |
|---|---|---|---|---|
| `/writing/` | 1.82 MB, 1,936 posts in one `<ul>` | 558,396 px | 1 | none (scrollWidth 390) |
| `/research/` | 1.43 MB, 1,061 projects | 383,792 px | 1 | none |
| `/stories/` | 32 KB | 8,637 px | 1 | none |

The hero, type and spacing of `/research/` look good on a phone. The weak part is weight, not looks.

**Tried and dropped.** `content-visibility:auto; contain-intrinsic-size:auto 150px` on `.posts li`
(`platform/pages/writing.mjs`). Load time stayed at about 1.17 s either way; the topic filter got
slower (55 ms to 217 ms to re-lay-out half the list hidden), and the 150 px hint was well below the
real card height (scroll height moved from 558k to 389k px, so the scrollbar would jump). Not shipped.

**Next, if someone wants the fix.** Server-render only the newest ~100 posts and keep every post
reachable by crawlable links (per-topic or per-month archive pages, which also give SEO landing pages),
with the finder searching a JSON index. Keep the no-JavaScript path. Check `sitemap.xml` and
internal-link coverage before and after. Lighthouse numbers were not taken this run.
