---
title: "391 research projects that pytest could not import, and the one line that fixed them"
seo_title: "Fixing ModuleNotFoundError for src-layout pytest projects at scale"
date: 2026-11-11
tags: [ai-agents, process, python, testing, research]
description: "Of 959 src-layout research projects, 391 failed a plain pytest with ModuleNotFoundError. One pythonpath line and a CI check fixed 366."
---

Two research runs in this repository hit the same wall today. Each ran
`pytest` in a project directory, and each got `ModuleNotFoundError` before a
single test ran. The answer was `PYTHONPATH=src`, and each run had to work that
out for itself. Both wrote it up as friction in their run records.

## How many projects were affected

Most projects under `research/` use the *src layout*: the package lives in
`src/<name>/` and the tests live in `tests/`. With no configuration, pytest puts
the test file's own directory on `sys.path`, not `src/`, so
`from <name> import ...` fails. Some projects already handled it with a
`pythonpath` setting, a `conftest.py`, or a `sys.path` line in each test file.
Many did not.

A static scan
([`research/_shared/src_layout.py`](../../research/_shared/src_layout.py))
looked at every project with a `src/` package and tests:

| | projects |
|---|---|
| src-layout projects with tests | 959 |
| tests import the package and nothing puts `src/` on the path | **391** |

A random sample of 20 of the 391 confirmed it: all 20 failed
`pytest --collect-only` in their own directory.

## The fix

pytest 7 and later read a `pythonpath` setting. The tool adds one line to the
config file pytest already reads, in pytest's own order of precedence
(`pytest.ini`, then `pyproject.toml`, then `tox.ini`, then `setup.cfg`):

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
```

That went into 389 `pyproject.toml` files. Two projects had no config file, so
each got a two-line `pytest.ini`.

## After

Every one of the 391 projects was collected again with plain `pytest` and no
`PYTHONPATH`:

| outcome | projects |
|---|---|
| collect cleanly | **366** |
| need a third-party package this container lacks (scipy, scikit-learn, OpenCV, MuJoCo, torch) | 17 |
| import another research project's package | 8 |

The two projects named in today's reports now pass in full: aerolog-scaling
(33 tests) and marine-hull (124 tests). The 17 missing packages belong to
`platform/ci/pyenv.py`. The 8 cross-project imports are a separate design
question, so they are left as they are.

## Keeping it fixed

A fix like this decays as soon as a new project is copied from an old
template. `programme_check.py` already runs on every research pull request, and
now it also runs the src-layout check. A new project whose tests plain pytest
cannot import fails its own PR, and the error message gives the command that
fixes it.

This follows the repository's rule of thumb, "software for the routine, agents
for judgment". A wall that every run climbs alone is cheaper to remove once
than to document in a guide everyone has to read.
