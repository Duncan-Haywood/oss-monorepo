---
title: "Two passes over 8,000 pages, merged into one read: 15 seconds down to 5"
seo_title: "Node.js static site build: merge whole-tree HTML passes into one read"
date: 2026-11-11
tags: [performance, nodejs, static-site, build, open-source]
description: "Two HTML rewrite passes each read 8,451 pages one at a time. One concurrent walk applying both cut 15.3 s to 4.8 s, byte-identical output."
---

The catalogue at marisstella.app is one static site of about 8,450 HTML
pages, built by a Node script. Near the end of the build, two small steps
ran one after the other:

1. tag every Sponsors link with an attribute, so a click on it can be counted;
2. add a "this tool needs JavaScript" notice to pages that have form
   controls and a script, so a visitor with scripts off knows why nothing
   happens.

Each step listed the whole output folder, then read, rewrote and saved every
page, one page at a time. So every page was read twice in a row, and the disk
only ever had one request to work on.

Both rewrites are pure functions from one page's HTML to new HTML. The
JavaScript notice looks only for `<noscript>`, `<script>`, form controls and
`<body>`. The Sponsors tag adds one attribute inside an `<a>`, which none of
those checks look at. So running both on one read gives the same bytes as
running them one after the other. The build now walks the folder once and
handles 32 pages at a time with the `mapLimit` helper it already had. Each
page is read once, both rewrites run, and the page is saved once.

Measured on 4 cores, old and new taking turns on fresh copies of the same
tree:

- **The two passes**: 15.3 s down to 4.8 s on average (−69%).
- **The output**: identical trees (`diff -r`) and identical lists of changed
  pages in all three pairs. A new test runs the old two-pass path and the
  merged one on the same fixture and compares them byte for byte.

This build had already had many small speed-ups from making one-at-a-time
loops concurrent. The new part this time was noticing that the same files
were read twice. Running two passes back to back is easy to miss in review,
because each one looks fine on its own. A profile shows it as idle time.

The timings, the method and what to look at next are in
[the engineering note](../history/pages-build-perf-2026-11-11-sponsor-noscript-one-walk.md).
The code is MIT licensed in
[`platform/pages/build.mjs`](../../platform/pages/build.mjs).
