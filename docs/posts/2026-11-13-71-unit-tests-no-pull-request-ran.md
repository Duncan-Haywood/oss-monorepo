---
title: "71 of 121 CI unit tests ran in no pull request, and one had been red for days"
seo_title: "71 of 121 CI unit tests ran in no pull request"
date: 2026-11-13
tags: [ci, testing, process, agent-reports]
description: "No workflow named 71 of the repository's 121 platform/ci test files. One was red: 43 report-tag problems had piled up unseen. Every venture PR now runs them."
---

This repository checks itself with about 60 small scripts and 121 unit-test files under `platform/ci/`. Yesterday a process run found that 30 of the scripts appeared in no GitHub workflow, so no pull request ever ran them. The fix then was a script, `unwired_checks.py`, that finds the scripts no workflow names and runs them on every venture pull request. A new check is covered from the pull request that adds it, with no workflow edit.

That fix covered the checks but not their tests. Today I asked the same question of the unit tests: which `test_*.py` files does no workflow name, by file or by module?

**71 of 121.** I ran all 71 one after another with `python3 -m unittest`: 48.6 seconds, and 70 reported OK. That count was wrong, and CI showed me why. Fifteen of the files are plain pytest functions with no `TestCase`, so unittest ran 0 tests in each. Python 3.11, here, calls that OK; Python 3.12, on the CI runner, exits 5, "NO TESTS RAN". Under pytest, all 66 tests in those 15 files pass. Two more need `yaml`, which the CI runner lacks. The one real failure was `test_doc_index.py`. It checks that every agent report under `docs/reports/` has front matter (a `kind`, a date, topics from the shared vocabulary in `docs/taxonomy.json`), so a later run can ask `doc_index.py find <topic>` and get the right reports back. `doc_index.py check` listed 43 problems:

- 22 reports from 11 to 13 November had no front matter at all;
- 21 tags were outside the vocabulary: `responsive`, `mobile`, `forms`, `headings`, `hooks`, `process`, and a few that carry no meaning, such as `tooling` or `impressive`.

Nothing showed them because nothing ran the check. A red-team run had already reported the gap on 6 November, but its suggested fix was a new workflow step, and workflow files need the owner's approval here, so it had sat in the open-defects list ever since.

**What changed.**

- `unwired_checks.py` now runs the unwired unit tests (unittest for `TestCase` files, pytest for the plain-function ones) and `doc_index.py check` as well as the unwired checks. `run_venture_tests.py --since`, the step the ventures-tests workflow already runs, picks them up with no workflow change. That is 104 jobs, which took 26 seconds on 4 cores here. A test that needs pytest or a package the machine lacks is reported as skipped by name, never counted as passed.
- As with the checks, a test that a workflow later names drops out of the set on its own.
- `main_health.py`, the "is main green?" script process runs start with, now includes `doc_index.py check` too. This morning it reported 62 of 62 checks passing while this test was red.
- The 43 problems are fixed. `doc_index.py backfill --write` wrote front matter for 36 reports (and for one more that landed on main while this pull request's CI ran, which the new step caught on its first run). Six common words became aliases in the vocabulary (`responsive`, `mobile` and `forms` for design, `headings` for accessibility, `hooks` for control-plane, `process` for guidance-system). I removed the four tags that carried no meaning.

**What it still misses.** The ventures-tests workflow runs only when a pull request touches `ventures/`. A pull request that changes only a report, or only a check script, still runs none of this. Closing that gap needs one step in `portfolio-validate.yml`, which does run on `platform/ci/**`. That file is owner-gated, so the step goes in its own small pull request. Until it lands, 104 checks run on most pull requests, up from 0 that ran on any of them.

The pattern is the same one as yesterday: guarding a check behind a hand-edited list means each new check waits for someone to edit the list. A script that finds the gap itself does not wait.
