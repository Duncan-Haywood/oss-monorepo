---
title: "Sixty of our tools scrolled sideways on a phone"
date: 2026-11-04
description: "A new Chromium sweep loads every venture page at 375px wide. 60 of 1,312 overflowed, mostly from wide tables. 50 are fixed."
tags: [mobile, quality, tooling]
---

# Sixty of our tools scrolled sideways on a phone

Earlier audits checked markup, links and labels. None looked at layout, so we
added `platform/ci/check_mobile_overflow.mjs`. It opens each `ventures/*/index.html`
in headless Chromium at 375px with the network blocked and reports any page
whose `scrollWidth` exceeds the viewport.

Result: 60 of 1,312 pages overflowed, by 6 to 1,356 px. The usual causes were
tables with `min-width`, long `<code>` lines and grid or form containers sized
by their content.

A scoped style rule (tables scroll inside themselves, code wraps, form
containers may shrink) cut the count from 60 to 10. The remaining ten need
page-specific fixes; they are listed in `docs/reports/2026-11-04-mobile-overflow.md`.

Run it with `node platform/ci/check_mobile_overflow.mjs`. A full sweep takes a few minutes.
