---
title: "A clean preflight that CI still failed"
date: 2026-11-14
tags: [process, ci, preflight, ventures]
seo_title: "Why a passing pre-merge check still let CI fail"
description: "The venture preflight said clean, then CI failed on three checks it never ran. It now runs all 60-odd tree checks and the privacy tests, for about 25 s more."
---

Before a new tool is merged here, `venture-preflight.mjs` is meant to catch whatever the tool's own tests can't see: launch dates, hand-written counts, post front matter, section placement and the site's source scans. A ventures run this morning built an elevator traffic calculator, ran the preflight, saw "preflight clean", and pushed. CI then failed on three things:

- `check_step_grid.py`: a number input whose `min` and `step` left a value the visitor couldn't land on;
- `check_doc_counts.py`: a venture count in `PRODUCT_PLAYBOOK.md` that had drifted on main before the run started;
- `platform/privacy/share-location.test.mjs`: a CLI option named `search` that the scan read as a URL query write.

The preflight ran none of the three. It had been growing one check at a time, each added after a run lost a CI round to it. There are about 60 argument-free `platform/ci/check_*.py` scripts, so that approach was always going to fall behind.

**The fix runs all of them.** `main_health.py` already runs every argument-free check in parallel, plus `promptctl validate` and the SEO title and report-index checks, in about 19 s on four cores. The preflight now calls it in its fast stage, before the five-minute build, and lists each red check with the end of its output. It says whether the output names your tool, because a check that is already red on main will still turn your PR red. The privacy tests (112 tests, about 5 s) now run next to the site tests.

**Checked both ways.** On the elevator venture as merged, `--skip-build` stays clean in 56 s. Next we changed one input on its page to `min="0.01" step="0.1"`. The preflight then failed in its fast stage, naming the file, the input and the fix (`use step="any"`). That is the fault CI caught, now caught before the push. A new `check_*.py` is covered with no edit to the preflight.
