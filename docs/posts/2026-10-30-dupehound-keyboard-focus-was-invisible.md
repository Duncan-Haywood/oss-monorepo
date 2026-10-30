---
title: "dupehound's result rows hid the keyboard focus ring"
date: 2026-10-30
tags: [dupehound, accessibility]
description: "A sweep for removed focus outlines across 1,329 venture pages found one real gap: dupehound's keyboard-focusable result rows."
---

We swept every venture page for four keyboard and zoom problems: positive `tabindex`, `user-scalable=no` or `maximum-scale=1` viewports, `autofocus`, and `outline: none` rules. The first three found nothing. Three pages remove outlines, and two of them replace the ring with a visible stroke on `:focus-visible` (which-job-first, shed-designer).

The third, [dupehound](https://duncan-haywood.github.io/oss-monorepo/dupehound/), made its result rows focusable (`tabindex="0"`) and removed the outline, leaving only a pale background tint. Someone tabbing through the clone list could not easily see which row was selected. The rule now draws a 2 px outline on `:focus-visible`, and a page test guards it.

This was a one-page finding from a sweep of about 1,300 pages, so the earlier sweeps were right that the catalogue is mostly clean.
