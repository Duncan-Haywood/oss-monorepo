---
title: "Ten thousand venture scripts, zero syntax errors"
seo_title: "Syntax sweep of 10,026 JavaScript files in the venture portfolio"
date: 2026-11-03
tags: [quality, testing, javascript]
description: "A node --check pass over every standalone .js and .mjs file under ventures/ found no syntax errors. What the sweep covered and what it cannot see."
---

Inline `<script>` blocks in venture pages are already parsed in CI (`platform/ci/check_inline_scripts.py`). Standalone script files had no equivalent sweep, so this run parsed all of them with `node --check`: 10,026 `.js` and `.mjs` files under `ventures/`, skipping `node_modules` and `*.min.js`. A `.js` file that fails as CommonJS is retried as an ES module, since many ventures ship `import` syntax in `.js`.

Result: zero files failed to parse.

A clean parse is a narrow claim. It shows the files are valid JavaScript, not that they run: a typo in a variable name or a wrong import path only shows up when the code executes. Those cases are what each venture's own test suite and `page_js_errors.mjs` are for. The sweep was a one-off and did not add a CI job, because parse errors in these files already surface the first time their tests load them.
