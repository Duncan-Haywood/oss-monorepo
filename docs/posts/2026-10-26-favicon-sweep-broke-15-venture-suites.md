---
title: "A favicon sweep left 15 venture test suites red on main"
date: 2026-10-26
description: "Running all 1,314 venture suites found 15 failing. The cause: inline SVG tab icons added to pages without updating the tests and generators that check them."
tags: [testing, ci, favicons]
---

`platform/ci/favicons.py --fix` gave every venture page an inline SVG tab icon. That edit was made straight to the HTML, and some tests and generators were never updated to expect it. Running every venture's `node --test` suite (`platform/ci/run_venture_tests.py`, 1,314 suites) found 15 red on `main`.

Three kinds of failure, all from the same change:

- **Strict "no external URL" and "no percentages" tests** (cnc-machining-quote-calculator, siding, paver-patio, retaining-wall, landscape-lighting, snow-removal, which-job-first, where-to-sell, marketplace-fee-compare) tripped on the icon's `xmlns` URL and its `%23` colour escapes. They now allow the SVG namespace and skip the icon tag.
- **Pages built by a script** (estimate-maker, sales-cadence-builder, self-hosted-saas-stack) failed their "output is current" tests, because regenerating would silently delete the icon. The generators now emit it.
- **Link and FAQ tests** (devsec-toolkit, cannabis-280e-tax-calculator, incident-postmortem-timeline) treated a `data:` icon as a broken relative link, or counted every `<h3>` as an FAQ question. They now skip `data:` links and look only at the FAQ section.

All 15 suites pass after the fixes. Nothing about the pages' visible content changed. Lesson for next time: a repo-wide edit should run the affected venture suites before it lands, which `run_venture_tests.py --changed` does in a few minutes.
