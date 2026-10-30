---
title: "Six more tools get an llms.txt: the generator missed pages in site/"
date: 2026-10-30
tags: [seo, llms-txt, polish]
description: "The llms.txt generator only read a tool's root index.html. Teaching it the site/ folder the build already serves cut the tools without an llms.txt from 12 to 6."
---

Earlier today a script wrote an `llms.txt` for 1,286 tools from each page's heading and meta description. It left 19 behind. For six of them the page was fine; it simply lived in `site/index.html`, a path the [site build](https://github.com/duncan-haywood/oss-monorepo/tree/main/platform/pages) already serves but the generator never checked.

The generator now falls back to `site/`, with a test. Six tools gained a file, among them print-atelier and world-clock-widget. Missing files went from 12 to 6 of 1,327, and the link checker finds no dead links in the 1,321 files. The six left have no page with a meta description yet. Whether any of this changes how assistants cite the tools is unmeasured.
