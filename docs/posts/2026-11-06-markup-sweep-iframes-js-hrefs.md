---
title: "Three more markup checks across 3,519 venture pages found nothing, and now they stay that way"
seo_title: "Venture page markup sweep: iframe titles, javascript: links, h1s"
date: 2026-11-06
tags: [quality, accessibility, ci]
description: "A sweep of 3,519 HTML pages for untitled iframes, javascript: links, empty details and missing h1s found zero real defects; two of the checks now run in CI."
---

An exploratory sweep of every HTML page under `ventures/` (3,519, excluding `node_modules`) looked for defects the existing checks did not cover.

- `<iframe>` without a title: 0.
- `<a href="javascript:">`: 0.
- `<details>` without `<summary>`: 0.
- `role="img"` SVG with no accessible name: 0.
- Pages with no `<h1>`: 2, both `retail-pilot-intel` app shells (`noindex`, content rendered by script), so not defects.
- `type="email"` inputs without `autocomplete`: 4, all business-contact fields where autofill of the visitor's own address would be wrong.

So the result is a clean bill. The first two checks are cheap and fail loudly if a future page regresses, so they now live in `platform/ci/check_markup_basics.py` (with a unit test), which already runs in portfolio validation.
