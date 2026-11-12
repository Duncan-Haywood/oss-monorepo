---
title: "165 lint errors on a clean main: running the linter version CI pins"
seo_title: "Local CI runs used the wrong ruff: 165 false lint errors"
date: 2026-11-12
description: "Our local CI runner reported 165 ruff errors on code CI passes: a newer ruff sat first on PATH. It now runs pinned tools from a venv of the job's pip install."
tags: [ci, python, developer-tools, testing]
---

Every change in this repository is checked twice: by GitHub Actions, and first by `platform/ci/run_workflow_locally.py`, which reads a workflow file and runs its `run:` steps on the session's machine. A local check is only worth having if it agrees with CI. Today it didn't.

## What went wrong

A session changed some stories and a blog post. The runner picked `photo-editing-ci.yml` among the affected workflows, and its lint job came back red:

```
$ ruff check .
Found 165 errors.
```

None of the 165 had anything to do with the diff, and `main` was green on GitHub. The workflow pins its tools:

```yaml
- run: pip install ruff==0.15.8 mypy==1.19.1
- run: ruff check .
- run: mypy
```

Locally, `pip install` did put ruff 0.15.8 in `/usr/local/bin`. But the container already had ruff 0.16.9 in `/root/.local/bin`, which comes first on `PATH`. So `ruff check .` ran a newer ruff with newer rules, and those rules flagged 165 things the pinned version accepts. Running 0.15.8 by hand gave "All checks passed!".

A false failure is worse than no check. The next person "fixes" working code, or learns to ignore the runner.

## The first fix wasn't enough

The obvious fix was to find the copy on `PATH` that reports the pinned version and put it first. That fixed ruff. Then mypy failed:

```
numpy/__init__.pyi:737: error: Type statement is only supported in Python 3.12 and greater
```

The pinned mypy now read the container's numpy stubs. CI's lint job never installs numpy, and the project sets `ignore_missing_imports`, so in CI mypy never sees numpy at all. Picking the right binary still left the wrong environment around it.

## What the runner does now

When a step calls a tool the job pinned with `pip install x==v`, the runner builds a virtualenv from that job's whole `pip install` line, unpinned packages and `-r` requirement files included, and caches it by content. Then it puts a one-binary shim for each pinned tool first on that step's `PATH`. `python3` and `pip` in the step are left alone, so the other steps behave as before. The report names what it did:

```
PINNED  lint / (unnamed): ran ruff 0.15.8 from a venv of this job's pip install
PINNED  lint / (unnamed): ran mypy 1.19.1 from a venv of this job's pip install
photo-editing-ci.yml: 4/4 run: step(s) passed
```

If the venv can't be built (no network, say), a failure under a tool at a different version from the pin is reported as UNRUN, not FAIL. The report prints the `pip install` that would make it a real check.

## Does it still catch real problems?

Yes. To test that, we added an unused import and a `x: int = "a"` to a photo-editing source file and ran the venv's tools: ruff found the import and mypy found the type error. With the fix, all four workflows that pin ruff or mypy and that we tried (photo-editing, ubuntu-agent-server, repository-branch-hygiene, vendor-change-watch) pass their lint steps locally, as they do in CI. Seven unit tests cover how pins are collected, which commands count as calling a tool, the venv shim and the UNRUN fallback.

The general lesson is an old one: pinning a version in CI only helps if every place that runs the check uses the pin too.
