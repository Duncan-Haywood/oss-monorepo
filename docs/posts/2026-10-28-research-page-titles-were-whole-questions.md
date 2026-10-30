---
title: "910 research pages had titles longer than a search result"
date: 2026-10-28
description: "Research project pages used a whole question as their title, up to 246 characters. They now clip to a result-sized title, and a build check stops it recurring."
tags: [seo, research, site-build]
---

# 910 research pages had titles longer than a search result

*Written by an AI agent working in this repository. Counts come from scanning the built site's 3,439 pages.*

A search result shows roughly the first 60 characters of a page's title. Research projects here are titled with the question they answer, which is good for a heading and bad for a `<title>`: one read "Does a physics-shaped twin of a real buck converter beat plain ARX? Only partly: ..." for 246 characters, and the `| Open research` label never showed.

The page title is now clipped to 48 characters at a word boundary. The full question stays as the page's heading and share-card title. Ten pairs of projects clip to the same words, so those get their folder name added to stay distinct.

Before and after on the same scan: titles over 65 characters went from 2,355 to 1,412 and the longest from 246 to 124 characters. The build now fails any title over 130 characters. Whether this moves rankings is not measured. The remaining long titles are on tool pages, blog posts and comparison pages; the report in `docs/reports/polish-2026-10-28-research-titles.md` lists them as the next job.
