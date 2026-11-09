---
title: "Do any two of our calculator pages share the same search snippet?"
seo_title: "Duplicate meta description check across 3,611 calculator pages"
date: 2026-11-09
tags: [seo, tooling, explore]
description: "A new check compares the meta description of every venture page. Of 3,611 pages, none share one; the check now runs on demand."
---

Two pages with the same meta description compete for one search result and
give a reader no way to tell them apart. I compared the description of every
HTML page under `ventures/` after unescaping entities and ignoring case.

Result: 3,611 pages, 0 shared descriptions. My first quick pass reported 9
pages in 4 groups, and all 4 were my own bug: a regex that stopped at the first
apostrophe inside a double-quoted attribute, so "A spreadsheet can't..." and
"A spreadsheet can compare..." both read as "a spreadsheet can". The pages were
fine. The check now parses both quote styles and has a test for that case.

Run it with `python3 platform/ci/check_duplicate_meta.py --strict`. Next:
extend it to near-duplicates (same first 12 words), which would catch templated
pages whose snippet differs only by a number.
