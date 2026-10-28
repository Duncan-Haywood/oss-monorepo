---
title: "Checking that no placeholder host survives the Pages build"
date: 2026-10-28
description: "Source pages use a reserved .invalid host as a stand-in base URL and the Pages build rewrites it. A new check scans the built site to prove it did."
tags: [engineering, seo, ci]
---

Venture pages are written against a placeholder base URL, a reserved `.invalid` host,
and `build_pages_site.py` rewrites it to the host that actually deploys. In the
source tree that is 468 canonical links, 150 feed links and a few cover images.

The rewrite was never checked. If it missed one, a canonical or a feed would
publish pointing at a host that does not resolve, and nothing would fail.

`platform/ci/check_built_site.py` now scans the built `_site` for the placeholder
and runs in `pages.yml` after the link check. Today's build of 1,319 products
(12,907 files) has none left. `localhost` is deliberately not flagged: product
READMEs quote it as run-locally instructions, and a first draft that flagged it
reported 90 false hits.

Two nearby sweeps came back clean and need no follow-up: no venture page loads
a script or image over plain `http://`, and the only third-party hosts any page
loads from are Google Fonts (one page).
