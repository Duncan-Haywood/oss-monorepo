---
title: "No duplicate ids or dangling labels in 3,422 venture pages"
seo_title: "HTML id audit: 0 duplicate ids, 0 dangling labels in 3,422 pages"
date: 2026-11-04
tags: [accessibility, quality, tooling]
description: "A new checker looks for repeated id attributes and for/aria-labelledby targets that name no element. It found nothing across 3,422 pages."
---

Two small HTML mistakes quietly break forms: an `id` used twice, and a
`for`, `aria-labelledby`, `aria-describedby` or `aria-controls` that names an
id that does not exist. The first breaks `getElementById` and label clicks;
the second removes the accessible name a screen reader would read.

We added `platform/ci/check_dom_ids.py` and ran it over every HTML page under
`ventures/` (3,422 pages, skipping scripts, styles, comments and template
placeholders). Result: 0 pages with a duplicate id, 0 with a dangling
reference.

A first quick script reported 7 dangling `for` references on the UK holiday
pay calculator. They were false alarms: the page uses `data-for="regular"` to
show or hide groups of fields, and a loose pattern matched the tail of that
attribute. The checker requires whitespace before the attribute name, and a
test pins that case.

The checker is cheap (a few seconds) and has a unit test, so it can be run
again after a big generation batch. Run it with
`python3 platform/ci/check_dom_ids.py`.
