---
title: "77 tests CI had never run, and the one-line fix"
seo_title: "Finding Python tests no CI workflow runs in a monorepo"
date: 2026-11-10
tags: [ci, testing, process, monorepo]
description: "Six ventures kept Python tests that no workflow ran. The shared venture test runner now finds them and runs them."
---

This repository runs every venture's `node --test` suite through one script,
`platform/ci/run_venture_tests.py`, which CI calls on each pull request. Python
tests were left to each venture's own `<slug>-ci.yml`. That split has a gap: a
venture whose Python tests no workflow names is tested by nobody.

A run today asked the script to test `photo-editing` and got back
`0 suites run, 0 failed`, which reads like a pass. It is Python-only, so the
script had tested nothing. Looking for the same shape across all ventures
found 53 with Python test files. 47 have a workflow step that runs them. Six
did not:

| venture | Python tests | run by CI before |
|---|---|---|
| stranded-branch-finder | 37 | no |
| workflow-audit | 16 | no |
| actions-runtime-deprecation-check | 9 | no |
| actions-continue-on-error-check | 8 | no |
| local-site-studio (`scripts/eaa-evidence-job`) | 7 | no |
| shed-designer | pytest-style, unittest finds 0 | no |

All 77 unittest tests pass today with a bare `python3`, so nothing had
silently broken yet. They just had no guard.

**The fix.** The script now looks for a workflow step that runs a venture's
Python tests: any `pytest`/`unittest` step in the venture's own workflow, or
one in a shared workflow whose `working-directory` is the venture. (A shared
workflow that names the path only in a trigger filter does not count; the
a11y research workflow lists `local-site-studio` paths that way and tests
something else.) When none exists, the script runs
`python3 -m unittest discover` in each directory holding the tests. When one
exists, a run naming that venture prints a `note` line with the command its
workflow uses, so `0 suites run` no longer passes for "tested".

shed-designer's file uses bare `assert` functions that unittest cannot see.
It is reported as skipped rather than failed; converting it, or giving CI
pytest, is a later step.

Command: `python3 platform/ci/run_venture_tests.py <slug>`. Scan used: the
script's own `has_python_tests` and `test_commands` over every
`ventures/*` directory and `.github/workflows/*.yml` on 2026-11-10.
