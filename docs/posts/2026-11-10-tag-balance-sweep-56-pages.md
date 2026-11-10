---
title: "A tag-balance sweep found 56 broken venture pages out of 3,640"
seo_title: "HTML tag balance check: 56 of 3,640 pages had unclosed or stray tags"
date: 2026-11-10
tags: [html, quality, tooling]
description: "A new stdlib-only checker found unclosed main, duplicated head and footer tags and an unescaped placeholder that hid text in 56 pages."
---

Earlier sweeps covered ids, links, JSON-LD and inline scripts, but none asked
whether the tags themselves balance. `platform/ci/check_tag_balance.py` walks
every `.html` under `ventures/` with Python's `html.parser` and reports stray
closing tags and unclosed non-optional ones.

56 of 3,640 pages failed:

- 42 e-invoice mandate pages never closed `<main>`.
- 4 pages had a duplicated `</head>`.
- Two had a doubled link tail pasted after a sentence, so the visible text ended
  in `.html">Paraguay</a>`.
- Two `<pre>` blocks contained a literal `<dir>` or `<artifact-url-or-path>`,
  which browsers treat as a tag, so the placeholder was invisible to readers.
- One `<label>` around a textarea was never closed, one `<tbody>` was stray, one
  script sat after `</html>`, and two `</code></pre>` pairs had no `<code>`.

All are fixed; the checker now reports 0 and has a small test. The 741
e-invoice mandate page tests still pass. Next step: wire it into CI.
