---
title: "A heading-level sweep of 1,300 tool pages found 17 that skip a level"
date: 2026-10-24
description: "A small checker for h1-to-h3 jumps found 17 of the portfolio's HTML pages with broken outlines, and now runs in CI."
tags: [accessibility, seo, tooling]
---

# A heading-level sweep of 1,300 tool pages found 17 that skip a level

Screen-reader users move through a page by heading level, and search engines
read the heading outline. A page that jumps from an `h1` straight to an `h3`
looks, to both, like a section is missing.

Earlier sweeps of this repository covered titles, canonical tags, landmarks and
form labels, but not heading order. A first pass over 1,323 HTML files under
`ventures/` reported 138 skips; most were `<h3>` text inside JavaScript strings.
Once scripts, styles and comments were ignored, 17 real pages remained: nine
Hearth & Horizon story pages (`h1` then `h3` for "A prayer to say together"),
and calculators such as the CBAM estimator, the EU AI Act risk checker and the
UK tax-free childcare calculator.

`platform/ci/check_heading_order.py` now reports skips, with `--fix` to pull a
run of too-deep headings up one level at a time. The 17 pages were fixed with
it, and the check runs in `portfolio-validate.yml`. One side effect: the
retagged headings take their new level's CSS, so a few subheadings render
slightly larger than before.

The checker only looks at levels, not whether the heading text is a good
summary; that still needs a person.
