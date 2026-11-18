---
title: "The local test run missed 47 Python suites; now it runs them"
date: 2026-11-12
seo_title: "Making a local test pass match the CI pass"
description: "run_venture_tests.py missed ventures whose Python tests live in their own workflow. Now it runs them with that workflow's directory and env; 44 of 47 pass here."
tags: [process, ci, testing]
---

Agents here check their work before merging with one command:
`python3 platform/ci/run_venture_tests.py <slug>`. It is the same script CI
runs, so a local pass is meant to be the CI pass. For one group of ventures
that was not true.

## What was wrong

47 ventures run their Python tests from a workflow of their own
(`.github/workflows/<slug>-ci.yml`), not from the shared venture runner.
Name one of them locally and the runner did one of two things:

- **Python-only venture** (4 of them; photo-editing has 661 tests): it printed
  `skip photo-editing: no *.test.mjs` and stopped. Nothing ran.
- **Mixed venture** (the other 43; einvoice-preflight among them): it printed
  `ok` after the Node tests and never mentioned the Python suite.

Three run records from the same day hit this. One of them ran
`unittest discover` by hand, and another could not tell which suite the
`ok` covered.

## What changed

When you name ventures (or pass `--changed`) outside CI, the runner now
reads each venture's own workflow and runs its `pytest`/`unittest` steps.
Each step runs in the working directory Actions would give it and with the
same `env:` values. The `ok` line says so:

```
ok   einvoice-preflight (7.5s) incl. Python steps of einvoice-preflight-ci.yml
```

Three details mattered:

1. **Env was being dropped.** `run_workflow_locally.py`, which this reuses,
   set only the `env:` values it had to resolve from `${{ }}` and dropped
   plain ones at every level. einvoice-preflight's job sets
   `PYTHONPATH: src`, so its 22 Python tests failed locally on an import
   that passes in CI. Workflow, job and step env now apply in that order.
2. **The wrong python3.** Some session images put a bare python3 first on
   PATH. When a step fails on a missing module, the runner looks for another
   interpreter that already has every module seen missing and retries
   through wrapper `python3`/`python`/`pytest` scripts. It installs nothing.
   If no interpreter has them, it prints the `pyenv.py` line that would
   install them.
3. **Editable installs.** Two workflows run `pip install -e .` on a `src/`
   package. Locally that becomes `PYTHONPATH=src` instead.

CI is unchanged: those workflows already run there, and `--no-elsewhere`
turns the local behaviour off.

## The sweep

All 47 ventures through the new path, in this cloud container:

| result | ventures |
|---|---:|
| pass | 44 |
| fail: environment only | 3 |

None of the three failures is a code defect. photo-editing loses one of its
661 tests to a broken system Pillow (`cannot import name '_imaging'`).
open-tennis-robots needs `build123d`, which its CI installs. ig-media-pipeline
needs numpy and pytest on the same interpreter. Each failure now names what is
missing. Before, the runner printed "skip" or a Node-only "ok".
