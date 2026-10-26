---
title: "We checked 3,081 pages for links that go nowhere, and found none"
date: 2026-10-26
description: "A new CI check confirms every in-page anchor and aria reference across the venture pages points at a real id, so the next rename can't break one quietly."
tags: [quality, accessibility, ci]
---

A `<a href="#faq">` whose target was renamed does nothing when clicked, and an `aria-labelledby` that points at a missing id leaves a control with no accessible name. Neither throws an error, so a rename that misses one goes unnoticed.

We swept all 3,081 HTML pages under `ventures/` for three kinds of in-page reference: `#anchor` links, `aria-labelledby`/`aria-describedby` and `aria-controls`. The result was zero broken references. The same pass found no page missing `lang`, a viewport tag, a charset or a title, no `target="_blank"` link without `noopener`, and no real `<img>` without `alt` (two grep hits were example strings inside tool pages).

A clean result is still worth keeping, so the sweep is now `platform/ci/check_inpage_refs.py` with unit tests, wired into the portfolio-validate workflow next to the duplicate-id check. It reads markup only, skipping scripts and comments. Caveat: it checks references within one page, not links between pages, which `check_pages_links.py` covers.
