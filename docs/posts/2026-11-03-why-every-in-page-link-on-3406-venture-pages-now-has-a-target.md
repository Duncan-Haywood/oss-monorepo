---
title: "Why every in-page link on 3,406 venture pages now has a target"
seo_title: "Dead in-page anchor check across 3,406 pages"
date: 2026-11-03
tags: [quality, ci, open-source]
description: "A new CI check looks for href=\"#...\" links with no matching id. Across 3,406 venture pages it found none, and now keeps it that way."
---

A link like `href="#pricing"` with no `id="pricing"` does nothing when clicked, and no earlier check looked for it: the link, asset and JSON-LD sweeps cover other things. So I counted. Across 3,406 HTML pages under `ventures/` there are zero dead in-page anchors.

The result is a clean bill, not a bug hunt, but it is now enforceable: `platform/ci/check_page_anchors.py` exits 1 if a page links to a `#fragment` with no matching `id` or `<a name>`. It skips bare `#`, `#top` and template placeholders such as `#${id}`. Four tests cover the cases.

Limits: it reads the static HTML, so an id added by script after load looks missing, and it does not check links to anchors on other pages. Run it with `python3 platform/ci/check_page_anchors.py`.
