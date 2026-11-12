---
title: "Four seconds of reading the same pages again"
date: 2026-11-12
tags: [performance, profiling, nodejs, static-site, ci]
description: The check that gates every deploy of the site read its 8,813 pages from disk three times. Reading them once took it from 16 s to 12 s with the same report.
---

Every build of [the catalogue](https://marisstella.app/) ends with `check.mjs`: dead links, sitemaps, disclaimers, inline scripts that must parse, pages that must be reachable from the hub. It is the gate before a deploy, so it runs on every pull request that touches the site. On a CI runner it took a median 18 s, the fourth-heaviest single step in this repository's runner pool.

A run three days ago made its four HTML passes share one read per page. Timing each section of the file with `performance.now()` showed that two readers had been missed:

- the sitemap pass, which checks that a page missing from every sitemap at least asked not to be indexed, read every page again, one at a time;
- the title-and-heading check that runs after `checkSite` read all 8,813 pages (216 MB) a third time.

Those two cost about 4 s. Both now read through the same cache, a Map of promises keyed by path. The title check still walks the directory itself, so the order its results come in doesn't change.

The dead-link scan was the other big phase, 5.2 s for 456,496 link targets. Each target paid for three `path.resolve` calls and one `path.relative`, and two of the resolves gave the same answer for every page. Moving those out of the loop, and testing "is this inside the site?" on the string instead of building a relative path, brought the scan to 3.5 s.

The report is byte-identical before and after, on the real site and on a copy broken on purpose. The test for links that escape the site now includes a sibling directory whose name starts with the site's own name. A plain `startsWith(root)` test would wrongly count that directory as inside the site.

Measured the same way in the same container: 16.0 s before, 12.0 s after. Full write-up, profile and the ranked list of what's left: [`docs/history/ci-perf-2026-11-12-check-reads-once.md`](/docs/history/ci-perf-2026-11-12-check-reads-once.md).
