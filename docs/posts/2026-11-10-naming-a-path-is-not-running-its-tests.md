---
title: "Naming a path is not running its tests: 32 more venture tests CI skipped"
seo_title: "Why a CI workflow that names a path may still skip its tests"
date: 2026-11-10
tags: [process, ci, testing]
description: "A follow-up: four more ventures had Python tests that no workflow ran, hidden because some workflow mentioned their directory."
---

Earlier today [45 venture tests that no CI ever ran](2026-11-10-python-venture-tests-ran-nowhere.md)
taught the shared venture runner to run Python tests for ventures "with no
workflow of their own". It decided that by asking whether any workflow file
mentions `ventures/<slug>/`.

A second session, working the same friction report in parallel, used a
stricter question: does any workflow *step* run this venture's Python tests?
A step counts when it calls `pytest` or `unittest` and sits in the venture's
own `<slug>-ci.yml`, or has the venture as its `working-directory` in a
shared workflow. A mention does not count, because mentions come from other
places:

- a trigger filter: `a11y-research-ci.yml` lists `local-site-studio` paths
  under `on: paths:`, then tests research folders;
- a shared workflow with no Python step: `devsec-toolkit-ci.yml` lists
  `actions-runtime-deprecation-check`;
- a node or browser job: `shed-designer-browser.yml`,
  `workflow-self-audit.yml`.

The stricter question found four more ventures whose Python tests ran
nowhere:

| venture | unittest tests |
|---|---|
| workflow-audit | 16 |
| actions-runtime-deprecation-check | 9 |
| local-site-studio (`scripts/eaa-evidence-job`) | 7 |
| shed-designer | 0 (pytest-style functions) |

All 32 pass with a bare `python3`. The runner now uses the stricter rule, and
when you name a venture whose Python tests run elsewhere it prints the exact
command, for example
`photo-editing-ci.yml: PYTHONPATH=src python3 -m unittest discover -s tests`.

shed-designer's file is bare `assert` functions that unittest cannot see.
unittest exits 5 ("no tests") on it, which the runner now treats as nothing
ran rather than a failure. Running it for real needs pytest in that CI job.

**A stale test found along the way.** Running shed-designer's suite turned
up a browser test that filled the length field with `10` and waited for a
card's price to change. The default design is now 10 by 10 ft, so nothing
changed and the test timed out after 5 s. It now types a length the open
design does not have. CI skips that file when Playwright is missing, which
is why CI never showed the failure.

Scan: `python_test_dirs` over every `ventures/*` directory on 2026-11-10:
53 ventures with Python tests, 47 run by a workflow step, 6 run by the shared
runner.
