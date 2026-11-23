# pyproject.toml Checker

A free tool for Python package authors: **paste a `pyproject.toml` and see every line that setuptools, hatchling or
flit_core will refuse, that pip will not install or that PyPI will reject on upload**, plus the ones that build fine
and quietly do the wrong thing. Each finding has the line, the reason and the fix. Nothing is uploaded.

**Live tool:** https://marisstella.app/pyproject-metadata-check/ ·
**Guide:** [why `license = "MIT License"` breaks your build](why-license-mit-license-breaks-your-build.html)

After using this, you can **fix a packaging mistake before `python -m build` or `twine upload` fails, or before a
release ships with a dependency that is never installed**. validate-pyproject checks the schema; this also names the
backend that will refuse a file (they disagree), catches marker values that are never true, Poetry syntax in standard
fields, a backend that `build-system.requires` never installs, entry points pip refuses, and readme or licence
files that are not there.

## What it reports

- **TOML errors** with the line (a duplicate key, a table defined twice), from its own TOML 1.0 reader.
- **[build-system]**: `requires` missing or invalid; the distribution that provides `build-backend` not in
  `requires` (an isolated build then fails with ModuleNotFoundError; known for setuptools, hatchling, flit_core,
  poetry-core, pdm-backend, maturin, scikit-build-core, meson-python, uv_build and others); no `[build-system]`
  at all (front-ends fall back to setuptools' legacy backend); `[tool.poetry.dependencies]`, `[tool.setuptools]` or
  `[tool.hatch.build]` that the chosen backend never reads.
- **[project]**: unknown keys with the intended one (`python_requires`, `author`, `homepage`, `dev-dependencies`...);
  `name`; PEP 440 `version`, its normal form and a local `+label` (PyPI refuses); `dynamic` naming `name`, an unknown
  field, or a field also given statically; one-line `description` under 512 characters; `readme` (string or table,
  content type, the file present); `authors`/`maintainers` (keys, commas, e-mail); `keywords`; `urls` (label length,
  http(s)); `scripts` and `gui-scripts` without a callable (pip: "A callable suffix is required"); `console_scripts`
  under `entry-points`.
- **Licences (PEP 639)**: SPDX expressions against SPDX list 3.27 (via packaging 26.3), canonical spelling,
  deprecated identifiers (`GPL-3.0` -> `-only`/`-or-later`), the deprecated table form, `license-files` patterns that
  leave the project or match nothing, and a `License ::` classifier beside an expression (high for setuptools and
  flit_core, which refuse it; medium for others).
- **requires-python**: invalid (`^3.9`), an upper cap (`<3.13`: pip then hands newer Pythons an older release),
  `~=` as a hidden cap, no lower bound, and Python classifiers it excludes.
- **Dependencies (PEP 508)**, in `dependencies`, every extra and every dependency group: parsed with the grammar of
  packaging 26's parser; Poetry `^`/`~`, a single `=`, a version without an operator; direct URL references (PyPI
  refuses the upload); markers comparing `sys_platform`, `platform_system` or `os_name` with a value they never take
  (`'windows'`, `'macos'`, `'Linux'`...); `python_version` against a three-part version; an `extra` marker in the main
  list (never installed); the project depending on itself; duplicates; every dependency pinned with `==`.
- **Extras (PEP 685)**: invalid names, two names that normalise to one, names that will be published normalised,
  self-references to an extra that does not exist.
- **Classifiers** against trove-classifiers 2026.9.21.13 (what PyPI accepts), with a near-miss suggestion,
  deprecated classifiers with their replacement, and `Private ::`.
- **[dependency-groups] (PEP 735)**: names, collisions, `include-group` targets and cycles.
- **Core metadata preview**: the METADATA fields a backend writes from the table (Name, Version, Summary,
  Author-email, License-Expression, Classifier, Project-URL, Requires-Python, Requires-Dist with the extra markers,
  Provides-Extra, Description-Content-Type).

## How it was checked

- **TOML reader** (`toml.mjs`) against Python's tomllib: all **717 TOML 1.0 cases** of the
  [toml-test](https://github.com/toml-lang/toml-test) suite (valid and invalid, same accept/reject and same values),
  the **936 pyproject.toml files** in this repository, **88 real projects' files** (`eval/corpus-repos.txt`: pip,
  setuptools, numpy, Django, FastAPI, ruff, uv...) and 27 hand-written edge cases (`toml.diff.test.mjs`; set
  `TOML_TEST_DIR` to run the suite).
- **Grammars** (`pep.mjs`) against packaging 26.3 (`pep.diff.test.mjs`, seeded generators, 4,000 strings each by
  default): PEP 440 versions (validity and normal form), specifier sets, PEP 508 requirements (validity, name,
  extras, URL, specifier count, marker presence) and SPDX expressions (validity and canonical form). All
  16,000 agree, and 30,000 of each kind with `PEP_DIFF_N=30000`. Two seeded mutations of the engine (accepting an
  `x` prefix on versions, dropping the `+` from licence ids) each fail the test, so it can fail.
- **Backend behaviour** (`eval/backend_claims.py`, output in `eval/backend-claims.json`): 17 one-change projects
  built with setuptools 84.2.1, hatchling 1.33.0 and flit_core 4.2.0. Every sentence in a finding that says a
  backend refuses, warns or accepts is checked against that file by `engine.test.mjs`. Several defaults changed
  because of it: hatchling accepts the licence classifier pair, an unknown `[project]` key and an invalid e-mail;
  setuptools accepts `console_scripts` under `entry-points` and only warns on a `license-files` pattern that
  matches nothing; all three accept a `.txt` readme. pip 24.0 refusing a script without a callable was checked by
  installing such a wheel.
- **Against validate-pyproject 0.27** (`eval/compare-validate-pyproject.mjs`), on the 936 repository files and the
  88 real ones: the two agree on every file about schema errors (ray's `[project]` table, used only for tool
  settings, has no name; both say so).
- **On the 88 real projects** (`eval/corpus-summary.mjs`, no file list): 1 with a high finding (ray, above), 13 with
  a medium one: 6 keep a `License ::` classifier next to an SPDX `license` (all build with hatchling, which allows
  it; setuptools or flit_core would stop), 5 use the deprecated licence table, 1 has two people in one author name.
  These are findings in public files, read on 2026-11-23, not bug reports.

Not modelled: backend-specific configuration under `[tool.*]` beyond the checks above, `setup.py`/`setup.cfg`
metadata, the contents of the readme (PyPI's renderer), and anything that needs the network (whether a dependency
exists on PyPI).

## Use it

- **Page:** paste `pyproject.toml` and, optionally, the file list (`git ls-files`) for the readme and
  `license-files` checks.
- **CLI** (no dependencies, no network): `node cli.mjs [folder or file]`; `--fail-on high|medium|low|info|none`
  (default high) sets the exit code for CI; `--metadata` prints the core metadata preview; `--json`; `--no-files`.
  The file list comes from `git ls-files -co --exclude-standard`, or a walk that skips virtualenvs and build folders.
- **Agents:** `node platform/agents/tools.mjs call pyproject-metadata-check analyze --input '{"text":"[project]\nname = \"x\"\n","files":["README.md"]}'`.

## Tests

`node --test engine.test.mjs toml.test.mjs cli.test.mjs page.test.mjs usage.test.mjs toml.diff.test.mjs pep.diff.test.mjs`.
`toml.diff.test.mjs` needs Python 3.11+ (tomllib); `pep.diff.test.mjs` needs packaging 26 or later and skips
without it (`PACKAGING_PYTHON=/path/to/python`). `data.mjs` is generated by `eval/build-data.py`.

## Usage tracking

Anonymous counters in the visitor's own local storage only (`pyproject_checked`, `example_loaded`, `high_found`,
`report_downloaded`), off under Do Not Track or Global Privacy Control, with an opt-out button. Nothing is sent.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal or professional advice; a valid licence identifier
says nothing about whether that licence suits you. Backend behaviour is what the versions above did in our test
builds. The final word is a real build and upload. Not affiliated with or endorsed by the Python Software
Foundation, the PyPA, PyPI or any backend's maintainers; Python is a trademark of the Python Software Foundation.

MIT licensed. The TOML table rules follow the flag model of tomli (MIT, Taneli Hukkinen), which is Python's tomllib;
the dependency grammar follows packaging's documented parser (BSD-2-Clause or Apache-2.0, PyPA). `data.mjs` holds
the SPDX License List (CC0) as shipped by packaging and the classifier list from trove-classifiers (Apache-2.0).
