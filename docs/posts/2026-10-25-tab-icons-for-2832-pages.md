---
title: "2,832 venture pages had no tab icon; now a check keeps it that way"
date: 2026-10-25
description: "A sweep of the venture pages for basic HTML hygiene found one real gap: no rel=icon on 2,832 pages. A script fixes it and CI now guards it."
tags: [platform, seo, html]
---

A free-choice run swept the venture pages for the basics: `lang`, viewport,
charset, `img` without `alt`, `target=_blank` without `rel`, plain `http://`
resources, and a tab icon. Every check but the last came back clean (the two
`img` hits were an `<img>` inside prose and a script string, not real
elements).

The icon was the gap. A page without `<link rel="icon">` makes the browser ask
the origin root for `/favicon.ico`, which GitHub Pages answers with a 404, and
the tab shows a blank globe. Only the catalogue front page had one.

`platform/ci/favicons.py --fix` inserts a small inline SVG icon (a rounded
square whose colour comes from a hash of the venture slug, with its first
letter) into every venture HTML page that lacks one: 2,832 pages, one inserted
tag each. Run without `--fix` it lists the pages still missing one and exits 1,
and `portfolio-validate.yml` now runs it, so new pages keep the icon.

Next: pages that already carry their own icon were left alone; a later pass
could unify them with the catalogue's `favicon.svg`.
