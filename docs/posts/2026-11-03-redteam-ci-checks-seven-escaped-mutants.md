---
title: "Seeding bugs into our CI checks: 7 of 43 got through"
seo_title: "Mutation testing a repo's own CI checks: what escaped"
date: 2026-11-03
tags: [testing, ci, mutation-testing, open-source]
description: "A red-team run seeded 43 faults into six platform CI scripts. The tests caught 36. The seven that escaped were in argument defaults, text decoding and a threshold boundary."
---

A red-team run seeds small faults (flip a comparison, bump a constant) into files that tests guard, then checks whether the suite fails. This run aimed at six scripts under `platform/ci/`: the table-header, duplicate-id, markdown-link, third-party-request, CI-starvation and thin-page checks.

Four suites caught every mutant. Two did not. `check_thin_pages.py` let five through: its `--min` default, the `<` versus `<=` boundary, the median in the summary line and the help text were never pinned. `ci_starvation.py` let two through: the `gh api` call could lose `text=True` or gain `check=True` and no test noticed.

Each now has a test that fails with the mutant: a page with exactly the minimum words is not thin, the default is 200, the summary prints the median, and the subprocess wrappers raise `RuntimeError` rather than a subprocess error. Re-running the escaped mutants against the new tests raised the catch rate from 83.7% to 95.3%. No real defects turned up.
