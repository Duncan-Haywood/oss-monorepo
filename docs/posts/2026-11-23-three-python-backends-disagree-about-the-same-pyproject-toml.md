---
title: "Three Python build backends, one pyproject.toml, three different answers"
seo_title: "pyproject.toml: what setuptools, hatchling and flit refuse"
date: 2026-11-23
tags: [python, packaging, pyproject, pep-639, open-source]
description: "We built one project 17 ways with setuptools, hatchling and flit_core. All three refused only 4. A free checker now names the backend that refuses."
---

[pyproject.toml Checker](../../ventures/pyproject-metadata-check/) is a new free tool,
[live here](https://marisstella.app/pyproject-metadata-check/). Paste a
`pyproject.toml` and it lists what setuptools, hatchling or flit_core will refuse
to build, what pip will not install and what PyPI will reject. It also lists the
mistakes that build fine and still do the wrong thing. Each finding comes with
the line and a fix. A command-line version gives CI a failing exit code.

The specifications say what a valid file is. To write the findings honestly we
also had to know what the backends do, and they turn out not to agree.

## The experiment

We built one tiny project with each backend's own build hook. Each run changed
one thing in `[project]` (setuptools 84.2.1, hatchling 1.33.0, flit_core 4.2.0;
the script is `eval/backend_claims.py` and the raw results are in
`eval/backend-claims.json`). There were 17 cases plus a clean control, which all
three built.

| In pyproject.toml | setuptools | hatchling | flit_core |
|---|---|---|---|
| `license = "MIT License"` | refuses | refuses | refuses |
| `license = "MIT"` plus a `License ::` classifier | refuses | builds | refuses |
| `license = { text = "MIT" }` | warns | builds | builds |
| `homepage = "..."` in `[project]` | refuses | builds | refuses |
| `[project.entry-points.console_scripts]` | builds | refuses | refuses |
| a `license-files` pattern that matches nothing | warns | builds | refuses |
| `requires-python = "^3.8"` | refuses | refuses | builds |
| an unknown classifier | refuses | refuses | builds |
| an author e-mail with no dot in the domain | refuses | builds | builds |
| no `description` | builds | builds | refuses |

All three refused only 4 of the 17 cases: an invalid licence string, an invalid
version, a field that is both static and in `dynamic`, and a readme table with no
`content-type`. Everything else depends on which backend you happen to use.

Two of these matter in practice:

- **hatchling builds with an unknown `[project]` key.** `homepage = "https://..."`
  is a common mistake (the right place is `[project.urls]`). setuptools and
  flit_core stop. hatchling builds, so the homepage never reaches the package and
  nothing tells you.
- **The PEP 639 licence change breaks some backends and not others.** Since
  PEP 639, `license` takes an SPDX expression (`"MIT"`), and the old
  `License :: OSI Approved :: MIT License` classifier is deprecated. setuptools
  and flit_core refuse to build when both are present. hatchling builds.

## What we found in 88 real projects

We ran the checker over the `pyproject.toml` of 88 well-known projects (pip,
setuptools, numpy, Django, FastAPI, ruff, uv, requests and others; the list is
`eval/corpus-repos.txt`), read on 2026-11-23:

- 6 projects keep a `License ::` classifier beside an SPDX `license`. All of
  them build with hatchling, which allows it. Moving to setuptools or flit_core
  would stop their build.
- 5 use the deprecated licence table, which setuptools now warns about.
- 1 lists two people in a single author name. The specification forbids commas
  there because the metadata joins people with commas, so every tool reads that
  entry as two people.
- 1 (ray) has a `[project]` table that only holds tool settings, so it has no
  name. validate-pyproject flags it too.

These are notes on public files, not bugs. Each project builds with the backend
it uses. The point is that "it builds" depends on the backend.

## The quiet ones

Some mistakes pass every backend and still go wrong after release. The checker
reports these too:

- `sys_platform == 'windows'` is never true, because the value is `win32`. A
  dependency behind that marker is silently skipped on every platform.
  `platform_system` uses `Windows`, `Darwin` and `Linux`, and `os_name` uses `nt`
  and `posix`.
- `requires-python = ">=3.9,<3.13"` builds fine. Then pip, running on 3.13,
  skips this release and installs the newest one whose range still matches,
  often an old release.
- `acme = "acme.cli"` under `[project.scripts]` builds fine. pip then refuses to
  install the wheel ("A callable suffix is required"). We checked that by
  installing one.
- `build-backend = "hatchling.build"` with `requires = ["setuptools"]` fails
  only in an isolated build, which is pip's default.

## How we know it reads the file right

- The TOML reader agrees with Python's tomllib on all 717 TOML 1.0 cases of the
  toml-test suite, and on 1,024 real files (the 936 in this repository plus the
  88 above).
- The version, specifier, dependency and SPDX licence grammars agree with
  `packaging` 26.3 on 16,000 generated strings. We also broke the engine on
  purpose in two ways, and both times the test failed.
- On the same 1,024 files, the checker and validate-pyproject agree about every
  schema error.

Next: Poetry 1's `[tool.poetry]` tables are still common, and a converter that
writes the equivalent `[project]` table, checked by this same engine, would help
the people the table above trips up most.
