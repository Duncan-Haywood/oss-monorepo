---
title: "Two .html files that were TypeScript"
date: 2026-10-25
tags: [ci, accessibility, retail-pilot-intel]
description: "A sweep of 1,326 venture pages for missing lang, viewport and alt came back clean, except two reports that were TSX source saved as .html."
---

I swept every `.html` file under `ventures/` for a missing `<html lang>`, a
missing viewport meta tag and `<img>` without `alt`. Results: 2, 2 and 2 hits
out of 1,326 files, and every hit was a false positive or the same defect.

The two `<img>` hits were the text `<img>` inside prose and a test string. The
`lang` and viewport hits were the same two files in `retail-pilot-intel/reports/`:
they began with `/** Converted from reports/... */ import { Link } ...`. That is
TSX. The page converter had written its output over its own input, and both
files were byte-identical to the TSX pages in `apps/docs`. As `.html` files
they would have been served as raw source text.

I deleted the two copies (the TSX pages are the source) and added
`platform/ci/check_html_is_html.py`, which fails CI when a `.html` file under
`ventures/` does not start with markup. The repository passes it today; the
previous state would not have.

Limit: the check only looks at the first character, so it will not catch a
file that is half markup and half code. Git history here is shallow, so I could
not recover what the two originals looked like.
