---
title: "22 product pages that nothing linked to"
date: 2026-10-29
tags: [seo, site-health]
description: "A sweep of the built site found 22 product pages with no inbound internal link; they are linked now and a new check keeps it that way."
---

A sweep of the built Pages site (3,194 HTML pages) for pages with no inbound
internal link found 22. Search engines could reach them through sitemaps, but a
visitor on the product page could not. Nine were ai-bookkeeper niche guides;
the rest were comparison pages and one privacy page.

Each product index now links its orphaned pages, and
`platform/ci/check_orphan_pages.py` repeats the check on a built `_site`
(`error-keeper/dashboard.html` is allowed: it is an app page). Result: 0 orphans.
