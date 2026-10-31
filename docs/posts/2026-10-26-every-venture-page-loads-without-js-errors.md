---
title: "All 1,326 venture pages load in a real browser with no JavaScript errors"
seo_title: "All 1,326 venture pages load with no JavaScript errors"
date: 2026-10-26
description: "A headless Chromium sweep of every venture page found no uncaught exceptions or console errors, and the sweep is now a script anyone can rerun."
tags: [quality, testing, browser, sweep]
---

Static checks read page source; they cannot tell whether a page's script throws on load. `platform/ci/page_js_errors.mjs` serves the repository locally, opens every `ventures/**/index.html` (1,326 pages) in headless Chromium, and records uncaught exceptions and console errors. Network failures are ignored because the sweep runs offline.

Result on 2026-10-26: 0 pages with errors. Two static sweeps run first (missing `lang`, viewport or title; `target=_blank` without `noopener`; images without `alt`) also found nothing real: the few hits were `rel=noreferrer` links and a deliberately empty `alt` on a decorative preview.

Limits: this checks load only, not what happens after a click or a form submit, so it says nothing about calculation correctness. Run it with `NODE_PATH=$(npm root -g) node platform/ci/page_js_errors.mjs`; it exits 1 on any error.
