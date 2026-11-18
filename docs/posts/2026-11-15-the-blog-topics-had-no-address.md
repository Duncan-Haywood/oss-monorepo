---
title: "Nine blog topics, and no page a search engine could find for any of them"
seo_title: "Why a blog's topic filter needs real pages, not a query string"
date: 2026-11-15
tags: [polish, seo, platform]
description: "The blog files about 4,860 posts under nine topics, but a topic was a JavaScript filter. Now each has its own page, title, description and sitemap entry."
---

The blog here files every post under one of nine topics: research findings, stories, tools, quality audits and so on. Until today a topic was a button. The index's finder, a search box and a row of topic chips, is hidden until its script runs; pressing "Research findings" filters the list in the browser and writes `?topic=research` into the address bar. A post's topic pill linked to that same query string.

That works for a reader. It does nothing for a search engine or an answer engine. A crawler that reads the blog index without running the script sees no topic chips at all, since the form is `hidden` until JavaScript shows it. And `writing/?topic=research` is the blog index again, with the same title, the same description and a canonical tag pointing back to `writing/`. So 1,064 research posts and 433 stories had no page of their own that could rank for "open research findings" or "AI-written science fiction stories".

## What changed

Each topic now has its own page at `writing/topic/<id>/` (for example `writing/topic/research/`):

- a search-shaped `<title>` written for each topic ("Open research findings, with the numbers and caveats"), the topic's one-line blurb and post count as the meta description, and one `h1`;
- the topic's 50 newest posts, then numbered pages for the rest (`page/2/` and up, `noindex`, the same rule the blog's own numbered pages follow);
- `CollectionPage` structured data with an `ItemList` of the posts on the page, and a `BreadcrumbList` matching the visible Home › Blog › topic trail;
- the topic's first page in the sitemap, nine new URLs in all.

The links in matter as much as the pages. Every post's topic pill and its "More in …" link now go to the topic page instead of the query string. The blog index, and every topic page, ends with a plain list of all nine topics and their counts, which works with JavaScript off. The cards on a topic page drop their topic pill, since all fifty would say the same thing.

| | before | after |
|---|---|---|
| Topic URLs a crawler can reach | 0 | 9 (plus 92 `noindex` numbered pages) |
| Topic URLs in the sitemap | 0 | 9 |
| Links from a post to its topic | 2, both to `writing/?topic=` | 2, both to `writing/topic/<id>/` |

The filter still exists for people who want to search inside a topic: each topic page links to `writing/?topic=<id>`.

## What this does not claim

This does not show that any topic page ranks. Nobody measures search traffic to this site yet, and Search Console reports would take weeks. The change is the precondition: a page has to exist, with its own title, before a search engine can rank it for anything. The report for the next polish run, `docs/reports/polish-2026-11-15-topic-pages.md`, lists what to check once the pages are indexed.
