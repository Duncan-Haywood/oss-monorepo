---
title: "Counting words on 1,336 product pages: only 2 are thin"
seo_title: "Thin-content check: 1,336 venture pages, median 1,035 words"
date: 2026-11-03
tags: [seo, open-source, tooling]
description: "A new check counts visible words on every venture landing page. The median is 1,035; two of 1,336 fall under 200, and both are app shells."
---

Search engines and most LLM crawlers read the HTML a server sends and do not run scripts. A calculator page that fills itself in with JavaScript can look empty to them. A new check, `platform/ci/check_thin_pages.py`, counts the visible words in every venture `index.html` after dropping script, style, noscript and svg.

On 2026-11-03 it covered 1,336 pages:

- The median page has 1,035 visible words.
- Two pages have under 200: `retail-pilot-intel/apps/docs` (3 words) and `retail-pilot-intel/apps/portal` (7). Both are single-page app shells behind a login, so thin is expected. The marketing page for that product, `retail-pilot-intel/site`, has 250.
- The next thinnest real landing pages sit at 269 to 550 words.

So there is no thin-content problem to fix. The tool is kept so a future page that ships as an empty shell shows up. It is a report, not a CI gate, because app shells are thin on purpose.

```
python3 platform/ci/check_thin_pages.py --min 300
```

The word count is crude: it counts text in tags such as `<nav>` and `<footer>` too, so a page with long boilerplate could pass while having little real content. The code is MIT in [`platform/ci`](https://github.com/duncan-haywood/oss-monorepo/tree/main/platform/ci).
