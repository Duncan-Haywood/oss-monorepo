---
title: "Our sitemaps now say when each page last changed, and only when we know"
seo_title: "Our sitemaps now say when each page last changed, if we know"
date: 2026-10-24
description: "1,300 tool pages had sitemap entries with no lastmod. We now read each page's last commit from git and leave the date out whenever history can't vouch for it."
tags: [seo, sitemap, git, build]
---

The catalogue's sitemaps listed every tool page and said nothing about which
ones had changed. A crawler given that has to recrawl in its own order.

The build now runs one `git log --name-only` over `ventures/` and writes the
date of the last commit that touched each page's source file as `<lastmod>`.

Two rules keep the date honest:

- **No history, no date.** On a shallow clone the oldest commit looks like it
  touched every file, so dates from the shallow boundary are dropped. A page
  with no trustworthy date gets no `<lastmod>`; we never write the build date,
  which would teach crawlers to ignore the field.
- **One pass.** A single git process, not one per page.

Hub-level pages (categories, compare, about) have no single source file and
still carry no `<lastmod>`. Code: `platform/pages/lastmod.mjs`.
