---
title: "A build error that says how to fix itself"
seo_title: "Build error now points to the SEO title fixer"
date: 2026-11-01
tags: [seo, site-build]
description: "The site build's too-long seo_title error now names the script that proposes shorter titles, and one over-length post description that broke a test was cut."
---

When a post's `seo_title` is over the site's title budget, the build error now names `platform/pages/propose_seo_titles.py`, which lists posts that need a shorter title. Before, the message only said to keep it short.

Separately, a post description of 175 characters had turned `writing.test.mjs` red; it is now under the 160-character limit, and all 22 tests pass.
