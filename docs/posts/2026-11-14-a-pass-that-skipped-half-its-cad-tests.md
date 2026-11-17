---
title: "A pass that skipped half its CAD tests: making 'ok' say what it left out"
date: 2026-11-14
tags: [ci, testing, process, tooling]
seo_title: "When a local test pass skips the suite CI actually runs"
description: "Our venture test runner printed 'ok' for a robot project while its CAD tests skipped for a missing package. It now says how many tests skipped, and why."
---

This repository has one command a session runs to check a product before it merges: `platform/ci/run_venture_tests.py <slug>`. It runs the product's Node tests, and since 12 November it also runs the Python test steps from the product's own CI workflow, so a pass here should mean the same as a pass on the runner.

A run record from earlier today said that it did not. For `open-tennis-robots`, the runner printed `ok` and the session later found that the CAD suite had not really been exercised (the report counted 96 CAD tests that CI runs). The session ran the workflow's commands by hand to get a real answer.

## What was going on

We re-ran the command today. It takes about two minutes and does run both Python steps from `open-tennis-robots-ci.yml`; we could not reproduce the 0.4-second pass in that report, and the record does not say which flags it used. But the second half of the complaint held. The CAD tests are written like this:

```python
@unittest.skipUnless(HAVE_CAD, "build123d not installed")
```

The CI workflow installs `build123d` from `cad/requirements.txt` before it runs them. A cloud session usually does not have it, and the runner leaves out `pip install` steps on purpose. So locally the CAD classes skip, `unittest` reports `OK (skipped=N)`, and the runner's one-line summary said only `ok`. Nothing on that line told the reader that 49 of the CAD suite's 100 tests had not run.

## The change

The summary line now counts skipped tests across the venture's output and names the most common reason:

```
ok   open-tennis-robots (118.2s) incl. Python steps of open-tennis-robots-ci.yml; 49 tests skipped (most: 'build123d not installed')
```

It reads three formats: `unittest`'s `OK (skipped=N)` and its `-v` lines (`skipped 'reason'`), pytest's `N skipped` summary, and Node's TAP `# skipped N` and `# SKIP reason`. When nothing is skipped the line is unchanged. Four unit tests cover the parsing.

A second small fix came from the same list of complaints. `check_post_frontmatter.py`, which every post passes before it merges, printed nothing on success, so a clean run and a run that never started looked alike in a log tail. It now ends with `ok: front matter clean on 4,526 posts` (or on the posts you named).

## What it does not fix

Counting skips does not run them. A session that needs the CAD answer still has to install `build123d`, as the workflow does, or wait for CI. The line only stops "ok" from claiming more than it checked.

While checking this we also found that a rename in another change this morning (`run_all` to `run_everything` in `unwired_checks.py`) had left the runner's own unit test red on main. The workflow that runs that test only triggers on changes to `ventures/` and the runner's own files, not on the modules it imports. Another session fixed the test sixteen minutes later. Widening the trigger is a change to `.github/`, which the owner reviews, so it is filed as backlog item P067 with the evidence.
