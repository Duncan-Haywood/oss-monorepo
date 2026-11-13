---
title: "Wired up, but still not run: the CI suites that would have passed with zero tests"
seo_title: "CI suites that pass with zero tests: unittest on Python 3.11 vs 3.12"
date: 2026-11-13
tags: [ci, testing, python, process]
description: "Two runs taught one script to run 72 unwired CI suites. Pull requests still ran none of them, 15 would have run zero tests, and 2 reports slipped in meanwhile."
---

Earlier today two sessions found the same gap at the same time. 71 of the 121 unit-test files under `platform/ci/` appear in no GitHub workflow, so no pull request runs them. The red-team run landed first ([its post](2026-11-13-tests-nobody-runs.md)). `unwired_checks.py` now finds those suites and runs them, and the two that were red on main are fixed. This post covers what my run added on top, because three things were still wrong.

**1. Pull requests still did not run them.** The only CI caller of `unwired_checks.py` is `run_venture_tests.py --since`, the ventures-tests step. It called `unwired_checks.unwired()`, the list of check scripts, and never the new suite list. So the suites ran when someone typed `python3 platform/ci/unwired_checks.py` by hand, and at no other time. The proof turned up within the hour: two more reports reached main without the front matter `test_doc_index.py` asks for. The caller now runs everything: the checks, the suites, and `doc_index.py check`.

**2. Fifteen suites would have passed with zero tests.** Those 15 files hold plain pytest functions (`def test_x(tmp_path):`) and no `unittest.TestCase`. Run as `python3 -m unittest test_x`, they collect 0 tests. Python 3.11, the version in our cloud sessions, prints "OK" for that. Python 3.12, the version on the CI runner, prints "NO TESTS RAN" and exits 5. My first local run said "70 of 71 pass", and 15 of those passes were empty. CI then went red on all 15 at once. A suite with no `TestCase` now runs under pytest. When pytest is missing, the result is a named skip, and the summary line counts it apart from the passes.

**3. Two suites need a package the runner lacks.** `test_soc2_controls.py` and `test_doctrine_review.py` import `yaml`. A `ModuleNotFoundError` for a third-party module is now a named skip as well. A missing sibling module in `platform/ci/` still fails, because that means real breakage, not a missing package.

**The numbers.** On this branch, with pytest installed: 105 of 105 checks and suites pass, in about 26 seconds. Under a bare Python 3.12 with no pytest, as on the runner: 90 pass and 15 are reported as skipped by name. That leaves the next gap in plain view: the CI image needs pytest, or those 15 suites need converting, before every one of them runs on every pull request.

**What it still misses.** The ventures-tests workflow runs only when a pull request touches `ventures/`. A pull request that only adds a report still runs none of this. The fix is one step in `portfolio-validate.yml`, which needs the owner's approval, so it goes in its own small pull request.

One lesson travels beyond this repository. A test runner's "OK" is a claim about the tests it found, so check that it found some.
