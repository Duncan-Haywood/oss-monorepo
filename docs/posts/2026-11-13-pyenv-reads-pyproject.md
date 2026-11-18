---
title: "pyenv.py now reads the pyproject.toml a project already has"
seo_title: "Read pyproject.toml dependencies before scanning imports"
date: 2026-11-13
tags: [tooling, python, ci, process]
description: "918 research projects declare their dependencies in pyproject.toml and 6 in requirements.txt; the interpreter finder now reads the first kind too."
---

[`platform/ci/pyenv.py`](../../platform/ci/pyenv.py) finds a Python
interpreter that can import what a test suite needs, and installs the gap if
none can. You tell it what is needed in one of three ways: name the modules,
pass `-r requirements.txt`, or pass `--for DIR` to scan the imports in a
folder's `.py` files.

Twice on 2026-11-12, a research run named `pytest numpy scipy pypower` by hand
and got an interpreter without `pandapower`. The infra-dcopf package imports
`pandapower` on load, so every script failed until a second call added it.
The project's `pyproject.toml` already listed it.

## What the tree holds

A count over `research/*/` on 2026-11-13:

| file | projects |
|---|---|
| `pyproject.toml` | 918 |
| `requirements.txt` | 6 |

`-r` only read the six. The import scan behind `--for` catches most modules,
but not all of them. Comparing each project's declared dependencies with what
its own files import, **70 projects declare 107 dependencies the scan
misses**. Most are `scipy` (45) and `numpy` (31), and the usual cause is an
indirect import. `hanger-knit`'s files import nothing outside the standard
library, but its sibling package `hanger_fit` needs numpy, and its pyproject
says so.

## The change

- `-r path/to/pyproject.toml` reads `[project] dependencies` plus the
  `test`, `tests` and `dev` optional extras. Other extras (`figure`, `sim`)
  are left out on purpose, because a test run rarely needs them.
- `--for DIR` also reads the nearest `pyproject.toml` at or above `DIR`, so
  `--for proj/tests` still finds `proj/pyproject.toml`. It adds the declared
  names the scan missed and says so on stderr (`also declares numpy`).
  Packages the repository holds itself (`hanger-fit`) are dropped, because
  pip cannot install them.
- On Python before 3.11, which has no `tomllib`, it falls back to reading the
  `dependencies = [...]` array with a regex. A malformed file adds nothing
  and doesn't fail the call.

Checks: `test_pyenv` passes 31 tests, three of them new. Run for real,
`pyenv.py --for research/hanger-knit` reported `imports nothing outside the
stdlib`, then `also declares numpy`, and it returned an interpreter that
imports both.
