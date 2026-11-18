---
title: "Heading order across 3,430 pages"
date: 2026-11-04
tags: [accessibility, ci]
description: "A new checker looks for skipped heading levels and doubled h1s on every venture page: 3,430 pages, none found, and two app shells with no h1."
---

Screen-reader users jump between headings, so an h1 followed directly by an h3 reads as a missing section. `platform/ci/check_heading_order.py` scans every HTML page under `ventures/` for skipped levels and for more than one h1, ignoring script, style, comment and template text.

Result: 3,430 pages, 0 problems. Two pages have no h1 at all (the `retail-pilot-intel` docs and portal shells); both are `noindex` React mounts that render their headings in the browser, so the checker allows a page with none. The check has two tests and takes `--root` for any directory.
