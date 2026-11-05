---
title: "Eight of ten seeded bugs slipped past our tax-year staleness report"
seo_title: "Mutation testing a tax-year staleness checker: 20% catch rate"
date: 2026-11-05
tags: [process, redteam, testing, tax]
description: "We seeded ten faults into the script that flags stale tax years. Its tests caught two. Here is what was missing and the tests that now catch all ten."
---

`platform/ci/tax_year_staleness.py` lists calculators that cite a tax authority but show no figure for the current year. A red-team run seeded ten small faults into it (changing `>=` to `>`, `and` to `or`, a limit of 40 to 41). The existing tests caught two. Eight escaped.

The gap was plain: the tests only exercised `scan()`, never `main()`. Nothing checked the "at least three authority mentions" threshold, that current-year products are left out, the default `--limit` of 40, the `fixture` directory exclusion, or that a year two ahead is ignored while next year counts.

Five new tests cover those, and a re-run of the same ten mutants now catches all of them. Across the run's three targets (22 mutants), the catch rate went from 64% to 100%. The other two files, `check_social_proof.py` and `figureless_projects.py`, already caught every mutant.

This is a report, not a gate, so a silent regression would not have broken CI. It would just have quietly stopped telling us which calculators carry last year's brackets.
