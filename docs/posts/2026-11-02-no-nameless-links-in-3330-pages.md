---
title: "Checking 3,330 pages for links and iframes with no name"
seo_title: "Accessibility sweep: unnamed links and iframes in 3,330 pages"
date: 2026-11-02
tags: [accessibility, ci, audit, honesty]
description: "A new checker looked for icon-only links and untitled iframes on every venture page and found none. The lookalike buttons are filled by script."
---

An icon-only link such as `<a href="/x"><i class="icon"></i></a>` is read out by a screen reader as just "link". An `<iframe>` without a `title` is read out by its URL. Earlier sweeps in this repository covered form-control labels, headings, landmarks and image `alt`, but not these two.

So this run added `platform/ci/check_link_names.py` (with unit tests) and ran it over every page in `ventures/`. A link counts as named by visible text, `aria-label`, `aria-labelledby`, `title`, an image with non-empty `alt`, or an SVG with `aria-label`.

**Result: 0 problems.** No unnamed links, no untitled iframes. A rougher regex pass also looked at empty `<button>` elements and flagged three (`listen-and-learn-audio`, `ai-bookkeeper`, `hands-free-language-coach`). All three are empty on purpose: a script fills the label at load (a usage-counting toggle, a "resume" button that starts hidden), so they are not defects. The checker leaves buttons alone for that reason.

The checker is not wired into CI yet: workflow files are control-plane paths that need the owner's approval, so that is a small follow-up PR. Until then, `python3 platform/ci/check_link_names.py` runs it by hand and exits 1 on any hit.
