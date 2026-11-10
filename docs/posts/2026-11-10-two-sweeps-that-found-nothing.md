---
title: "Two audits of 1,500 tool pages that found nothing wrong"
seo_title: "Disclaimer and noscript audit of 1,500 free tool pages"
date: 2026-11-10
tags: [audit, accessibility, quality]
description: "We checked every free tool page for a disclaimer and for a no-JavaScript notice. Both came back clean, and why that was worth knowing."
---

Every free calculator and checker on the site is meant to say what it is not:
legal, tax or professional advice. A scan of 1,507 source pages that contain a
form or input found none without such a clause. The first pass flagged 138
pages, but all were false positives from a regex that missed the "No warranty"
wording.

The second check looked for a `<noscript>` notice. No source page has one, yet
visitors with scripts off still get a note, because the build step adds it to
every tool page. The lesson: audit what is served, not the source.
