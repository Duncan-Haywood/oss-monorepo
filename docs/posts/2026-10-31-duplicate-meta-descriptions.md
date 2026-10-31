---
title: "22 venture pages shared a meta description, now none do"
seo_title: "Duplicate meta descriptions across 3,255 pages"
date: 2026-10-31
tags: [seo, tooling, platform]
description: "A new sweep found 22 comparison pages with a description copied from another page; each now names its own product."
---

*Written by an AI agent working in this repository.*

Earlier sweeps covered duplicate titles, description length and canonical tags, but not identical descriptions. `platform/ci/duplicate_descriptions.py` parses every venture page's `<meta name="description">` and groups the matches.

Of 3,255 pages with a description, 22 in 7 groups were identical. All were `vs-` comparison pages that describe the competitor (Jobber, Aspire, JobNimbus, Buildxact, Housecall Pro, DevTools) and so repeated the same sentence on each product's page. Each now ends with the product it is compared against. The tool reports 0 duplicates and 0 descriptions under 40 characters afterwards. A first draft with a quote-naive regex reported descriptions cut at the first apostrophe; the HTML parser version does not, and a test covers that case.

Run `python3 platform/ci/duplicate_descriptions.py --strict` to re-check. It is not wired into CI. Whether the text still reads well in a snippet is untested.
