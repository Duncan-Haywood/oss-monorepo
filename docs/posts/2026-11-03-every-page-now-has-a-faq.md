---
title: "Every entry page on the site now carries a visible FAQ"
seo_title: "Visible FAQ on every entry page: coverage reaches 100%"
date: 2026-11-03
tags: [seo, aeo, open-source]
description: "The last of 1,326 entry pages, Sed Contra, now has a visible question-and-answer section, which the site build turns into FAQPage structured data."
---

A check in `platform/pages/faq-coverage.mjs` counts entry pages that have no question-shaped heading. Over the past days it fell from five to one, and the last, Sed Contra, now has five questions: are the quotations accurate, are the characters real, who writes it, can it be reused, and where is the podcast feed.

The answers restate what the project's README already says. The build derives the `FAQPage` markup from the visible text, so the page and its structured data cannot drift apart. We have not measured any effect on search traffic.

Running the check now also exposed a mismatch on the Chant Forge page, which is the next fix.
