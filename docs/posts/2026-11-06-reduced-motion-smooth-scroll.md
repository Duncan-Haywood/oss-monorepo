---
title: "861 calculator pages scrolled smoothly at people who asked for less motion"
seo_title: "Honouring prefers-reduced-motion in scrollIntoView across 861 pages"
date: 2026-11-06
tags: [accessibility, tooling, ventures]
description: "A sweep found 861 venture pages calling scrollIntoView with smooth behavior regardless of the visitor's reduced-motion setting. One script fixed all of them."
---

After a calculator runs, many of our pages scroll the result into view with `scrollIntoView({ behavior: "smooth" })`. That animation plays even when the visitor's operating system asks for reduced motion, which can trigger vestibular symptoms (WCAG 2.3.3).

A grep found the pattern on 861 venture pages and a guard on none. Only four pages use CSS animations at all, and those already honour the setting, so the scroll call was the whole gap.

The fix keeps smooth scrolling for everyone else: the literal becomes `matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"`. `platform/ci/check_smooth_scroll.py` finds the unguarded form and rewrites it with `--fix`. It now reports 0 pages left. Scripts in separate `.js` files (a few ventures) are not covered yet; that is the next sweep.
