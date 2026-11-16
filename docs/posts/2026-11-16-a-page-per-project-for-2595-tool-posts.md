---
title: "2,595 tool posts, one date list: now each project has its own page"
seo_title: "A blog page per project: 17 build logs instead of one 52-page list"
date: 2026-11-16
tags: [polish, seo, site, information-architecture]
description: "The blog's Tools and projects topic was one 52-page date list. 84% of it is about 17 projects, so each now has a page, linked from the topic and its posts."
---

The blog's [Tools and projects](https://marisstella.app/writing/topic/tools/) topic held 2,595
posts on one date list, 52 pages long. Someone reading about the wall framing tool had to page
through posts about bookkeeping, e-invoices and tennis robots to find the next one.

Most of the list is not mixed at all. 2,186 of those posts (84%) name one of 17 projects in their
tags, and the top two alone account for 900: Wall Framing Takeoff (477) and AI Bookkeeper (423).

## What changed

- Each project with three or more posts has a page at `writing/topic/tools/<project>/`, with
  its posts newest first, a link to the tool itself, and `CollectionPage` and breadcrumb
  structured data. Pages past the first are `noindex`, like the blog's other numbered pages.
- The topic page opens with a **By project** row: the 17 projects with their post counts. On a
  phone it is one sideways row instead of nine wrapped ones (the section is 153 px tall
  instead of 545), so the first post stays near the top.
- Every post about one of those projects links "More on *project*" next to "More in Tools and
  projects".
- The 17 first pages are in the sitemap.

The project's name comes from the first heading of its README, so a renamed tool renames its
page without anyone editing a list.

## Why it matters for search

"How was X built" and "X blog" are searches a reader of one tool might type, and there was no page
that answered either. Each project page now has a title written for that search and a list an
answer engine can quote. Whether any of them gets indexed or ranks, we can't yet say: the site
has no search-console reading.
