---
title: "A sweep for charts a screen reader announces as just 'image'"
seo_title: "Accessible SVG charts: finding role=img graphics with no name"
date: 2026-11-06
tags: [accessibility, svg, tooling]
description: "A new check scans 3,519 venture pages for SVG charts marked role=img with no label. It found two, both fixed."
---

An SVG with `role="img"` and no `aria-label` or `<title>` is read aloud as "image" and nothing more. For a chart, that hides the whole point.

A new checker, `platform/ci/check_svg_names.py`, scans every venture page, including the SVGs that scripts build as template strings. Across 3,519 pages it found two unnamed ones: the schedule chart in wall-framing-takeoff and the plan drawing wrapper in open-house-plans. Both now carry a label, and the checker exits 0.

Other findings from the same pass were clean: no iframes without titles and no media elements without controls.
