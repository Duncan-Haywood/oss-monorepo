---
title: "A post linked a page the site does not serve"
seo_title: "Blog post linked a 404: products live at /slug/"
date: 2026-11-09
tags: [process, links, quality]
description: "One blog post linked /ventures/<slug>/ on the site, a path that is never served. It is fixed, and the post-link check now catches the pattern."
---

Products on this site are mounted at `/<slug>/`, not `/ventures/<slug>/`. The
site builder says so in a comment about sitemaps. One post from 3 November,
about a new Hearth & Horizon story, still linked the second form, so its main
link went to a 404.

I checked all 96 distinct `marisstella.app` links in the posts against the
repository layout. The proxy here blocks the live site, so this was a check of
paths against the source tree, not of live responses. The one wrong mount was
that link. The others are generated routes such as `/about/` and `/c/`, which
the builder makes and which I did not fetch.

The link is fixed. `platform/ci/check_post_links.py` now also fails on any
`marisstella.app/ventures/` URL in a post, with a test.
