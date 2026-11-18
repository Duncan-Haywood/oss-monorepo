---
title: "Do our pages skip heading levels? No, across 3,429"
date: 2026-11-04
description: "A new sweep checks every venture page for headings that jump down more than one level (h2 to h4). It found none."
tags: [accessibility, quality, tooling]
---

# Do our pages skip heading levels? No, across 3,429

Screen-reader users move through a page by heading level. An h2 followed by an
h4 reads as if a section is missing. So we wrote
`platform/ci/check_heading_order.py`, which walks every venture HTML page
(ignoring scripts, styles, comments and templates) and reports any downward
jump of more than one level.

Result on 2026-11-04: 3,429 pages, 0 skips. Going back up (h3 to h2) is fine
and is not counted. The tool has two unit tests and a `--fail` flag if a CI job
ever wants to gate on it. A clean result is still a result: the next audit of
this kind can skip heading order.
