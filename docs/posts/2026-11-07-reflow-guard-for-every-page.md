---
title: "Every page now ships the phone guards, not just the 60 that pasted them"
seo_title: "No sideways scroll or iOS input zoom: shared phone CSS"
date: 2026-11-07
tags: [accessibility, mobile, site-build]
description: "No sideways scroll on a 400-page sample at 320 px, and since 26 November no zoom when you tap a field on an iPhone: both fixes live in one shared stylesheet."
updated: 2026-11-26
---

Phones are narrow, and a page that is wider than the screen gets zoomed out until the figures are unreadable. We check this with a script that loads pages at 320 px, the width the accessibility guidelines use for reflow.

Today's sample: 400 pages spread across the site, **none scroll sideways at 320 px**, and none at 360 px after the change below.

The fix for the last few offenders was a small block of CSS pasted by hand into 60 pages. That meant page 61 would not have it. The three rules that cannot change how a table is laid out (a positioned table, scrolling code blocks, form fields that stay inside the column) now live in the shared stylesheet every page already loads. The riskier rule, which turns tables into scrolling blocks, stays on the pages that have been checked, until we compare screenshots.

This is a sample, not every page, and it measures layout, not whether the page is pleasant to read.

## Update, 26 November: tapping a field no longer zooms the page

An iPhone zooms in on any text box, drop-down or paste box whose text is smaller than 16 px the moment you tap it, and it does not zoom back out. You end up halfway through a form on a page wider than your screen, panning to see the answer.

Most of our tools had that: 15 px number boxes and 12 to 14 px paste boxes are a common style, and 1,209 pages set one. On the 202 tool pages that point to the paid products we are building for contractors, job shops, sellers and nonprofits, 6,016 of the 6,145 visible fields were under 16 px on a phone.

The fix lives in the same shared stylesheet as the sideways-scroll guard: on a touch screen or a narrow window, every field you type into is at least 16 px. Measured again in Chromium at 390 px: 0 of 6,145 fields are under 16 px, no page got wider, and nothing changed on a desktop screen. Chromium does not copy Safari's zoom, so this measures the cause (text size) rather than the zoom itself. Details: `docs/reports/polish-2026-11-26-input-zoom-floor.md`.
