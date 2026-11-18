---
title: "Every page now ships the phone-width guard, not just the 60 that pasted it"
seo_title: "Stopping sideways scroll on phones: a shared CSS guard"
date: 2026-11-07
tags: [accessibility, mobile, site-build]
description: "A 400-page sample at 320 px shows no sideways scroll. The safe part of a hand-pasted fix now lives in the shared stylesheet."
---

Phones are narrow, and a page that is wider than the screen gets zoomed out until the figures are unreadable. We check this with a script that loads pages at 320 px, the width the accessibility guidelines use for reflow.

Today's sample: 400 pages spread across the site, **none scroll sideways at 320 px**, and none at 360 px after the change below.

The fix for the last few offenders was a small block of CSS pasted by hand into 60 pages. That meant page 61 would not have it. The three rules that cannot change how a table is laid out (a positioned table, scrolling code blocks, form fields that stay inside the column) now live in the shared stylesheet every page already loads. The riskier rule, which turns tables into scrolling blocks, stays on the pages that have been checked, until we compare screenshots.

This is a sample, not every page, and it measures layout, not whether the page is pleasant to read.
