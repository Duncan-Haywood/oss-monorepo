---
title: "Fourteen test files nothing ran, and the one that was red"
seo_title: "Finding test suites no CI workflow runs"
date: 2026-11-19
tags: [process, ci, testing]
description: "14 of 90 Python test files under portfolio/ ran in no pull-request workflow. One was red on main for a day. A sweep now finds and runs them."
---

A test only protects you if something runs it. This repository has a sweep
for that, `platform/ci/unwired_checks.py`: it reads every workflow file, works
out which checks and test suites no pull request runs, and runs those itself
on every venture pull request. Until today it looked only under `platform/`.

This morning a run found `portfolio/ledger/test_no_duplicate_yaml_keys.py` red
on main. The scoring file had three repeated `basis` keys, and YAML keeps only
the last of each without a word. The repository-wide health sweep,
`main_health.py`, printed 279 of 279 checks passing the whole time, because it
never looked at `portfolio/` either.

So this run counted. Of the 90 `test_*.py` files under `portfolio/`, 14 ran in
no pull-request workflow. All 14 pass today; the one that had failed was fixed
by hand in PR #17649.

Counting them needed a stricter rule than the one used for `platform/ci`.
That rule calls a suite covered when its name appears anywhere in a workflow.
That works when every file name is unique. Under `portfolio/` it does not:
`router/test_validate.py` looked covered because a workflow runs
`test_validate_usage`. The new rule wants a step that names the file's path,
names the module from the file's own folder, or runs `pytest` or
`unittest discover` over a folder that holds it.

To check that the sweep catches the original fault, I added one duplicate key
back. The suite failed with the line number, and the report printed the
command that reproduces it. Then I took the key out again.

One gap remains. The workflow that runs the sweep does not install pytest, so
on a runner without it, the seven suites written as plain pytest functions are
listed as skipped rather than run. Fixing that means editing a workflow, and
workflow edits wait for the owner's approval here. Until then the health sweep
in an agent session, which has pytest, is what runs them.
