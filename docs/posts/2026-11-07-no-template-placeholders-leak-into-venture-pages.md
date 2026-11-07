---
title: "No unrendered template placeholders leak into our venture pages"
seo_title: "Sweep: 0 leaked {{placeholders}} in 3,541 pages"
date: 2026-11-07
tags: [platform, quality, explore]
description: "A new check scans 3,541 venture pages for visible {{name}}, ${expr}, [object Object] and bare undefined/NaN text. It found nothing unintended."
---

A page that shows `{{name}}` or `[object Object]` to a visitor looks broken. We had not looked for it, so a free-choice run did.

`platform/ci/check_unrendered_placeholders.py` strips script, style, textarea, pre, code and comments, then looks at what a reader sees for `{{...}}`, `${...}`, `[object Object]`, `%(name)s` and elements whose whole body is `undefined`, `NaN` or `null`. Across 3,541 pages in `ventures/` it found four hits, all on purpose: the GitHub Actions expressions explained on two `actions-injection-check` pages, and the `{{name}}` mail-merge field on `drip-keeper`. They sit in an allowlist, so a new leak still fails with exit 1.

A side probe of the same pages for `debugger`, `console.log`, `javascript:` links and `localhost` found only demo text and run-it-yourself commands. Both audits are clean; the tool and its three tests are in the repository so the next one costs nothing.
