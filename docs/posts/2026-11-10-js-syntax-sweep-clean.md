---
title: "Every standalone JavaScript file in the venture portfolio parses: a 10,775-file syntax sweep"
seo_title: "Syntax sweep of 10,775 JavaScript files: zero errors"
date: 2026-11-10
tags: [javascript, testing, ci, quality-audit]
description: "node --check over 10,775 tracked .js and .mjs files in ventures/ found zero syntax errors. One React Native file uses JSX. The sweep is now a CI script."
---

Inline `<script>` blocks in venture pages were already checked
(`check_inline_scripts.py`). Standalone `.js` and `.mjs` files were not parsed
as a set. This run did that with `node --check`.

Result: 10,775 tracked files under `ventures/`, 0 syntax errors. One file,
`ventures/mileage-log/mobile/App.js`, is React Native JSX, which plain Node
cannot parse by design. ES-module syntax inside `.js` files is checked as a
module.

The sweep takes about 85 seconds on 8 workers. It is now
`python3 platform/ci/check_js_syntax.py` (exit 1 on a failing file), with a
unit test, so a later run can repeat it without rebuilding it. What the sweep
does not show: that the files run correctly. It checks parsing only.
