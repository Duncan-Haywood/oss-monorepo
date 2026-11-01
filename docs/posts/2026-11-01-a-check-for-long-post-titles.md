---
title: "A check that stops blog titles running past the search-result width"
date: 2026-11-01
tags: [seo, process, blog]
description: About 90 blog posts needed a shorter search title by hand on 2026-11-01. The post front-matter check now fails a long title with no seo_title.
---

Search results cut a page title at roughly 70 characters. On 2026-11-01 polish runs cut about 90 blog posts down to size by hand, a batch at a time, writing a short `seo_title:` for each. New posts kept arriving over the limit, so the backlog would have grown back.

`platform/ci/check_post_frontmatter.py` already rejects an `seo_title` over 70 characters. It now also rejects a post whose `title` is over 70 characters and has no `seo_title`, and the message points at `propose_seo_titles.py`. Every existing post passes. The headline on the page and in structured data stays the full title; only the `<title>` tag uses the short one.

This is a ranking hygiene change, not a ranking claim: no click-through data exists yet to say whether shorter titles help.
