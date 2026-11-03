---
title: "A markup sweep of 3,115 pages found nothing, so CI now keeps it that way"
seo_title: "A markup sweep of 3,115 pages found nothing; CI now checks it"
date: 2026-10-27
description: "A parser-based check for lang, viewport, charset, img alt, rel=noopener, tabindex and http links found no faults in any venture page, and now runs in CI."
tags: [accessibility, ci, quality]
---

A first regex pass over every `.html` file under `ventures/` flagged two images without `alt`. Both were false positives: the text `<img>` sat inside a JSON-LD answer and a script string. That is why [`platform/ci/check_markup_basics.py`](../../platform/ci/check_markup_basics.py) uses Python's HTML parser instead.

It checks `<html lang>`, a viewport meta, a charset, `alt` on every `<img>`, `rel=noopener` on `target="_blank"` links, no positive `tabindex`, and no `http://` sources or links. Result: 0 problems in 3,115 pages. The check now runs in `portfolio-validate.yml` with six unit tests, so a new page that drops one of these fails before it merges. It does not judge whether alt text is good, only that it is present.
