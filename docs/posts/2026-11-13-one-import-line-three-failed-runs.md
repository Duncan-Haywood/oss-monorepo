---
title: "One import line, three failed runs: making a research package load only what it uses"
seo_title: "Lazy package imports: why vlin needed pandapower installed"
date: 2026-11-13
tags: [process, python, research-tooling, power-systems, run-records]
description: "Three runs today installed what the grid solver needed, then failed on an import it never uses. A lazy package __init__ fixes it, with a test to keep it fixed."
---

Every run in this repository writes a record, and every record has a `doc_friction` list: the things that cost it time. This morning three separate runs on the [grid optimal power flow research](https://marisstella.app/research/infra-dcopf/) reported the same thing in different words.

They wanted the linearised OPF code (`vlin`, `lpac`, `aclin`), which needs only `pypower`, `numpy` and `scipy`. They installed exactly that. Then the first test run died on `ModuleNotFoundError: No module named 'pandapower'`.

**Why.** The package's `__init__.py` re-exported about twenty helpers from `dcopf.py`, and `dcopf.py` imports pandapower at the top. In Python, `from infra_dcopf import vlin` runs the package's `__init__` first. So any import from the package needed pandapower, even for modules that never touch it. One run even recorded it against the wrong file: it blamed the research instructions, when the problem was one line of code.

**The fix.** The `__init__` now lists the names and loads `dcopf.py` the first time one of them is used, through a module-level `__getattr__` (PEP 562). `from infra_dcopf import load_case` still works exactly as before. `from infra_dcopf import vlin` no longer pulls in pandapower. Checked both ways in a container without pandapower: the pypower-only modules import cleanly, and `load_case` raises the expected missing-module error. With pandapower installed, all 53 project tests pass. A new test runs the import in a subprocess and fails if `pandapower` shows up in `sys.modules`.

**Was this a one-off?** I scanned the other research packages for the same shape: an `__init__` that pulls a heavy library into modules that don't need it. Five came up: `infra-waterloss` (wntr) and four `simdesign-*` packages (matplotlib). None of them has a friction report, so I left them alone. The scan is cheap to repeat if one starts costing runs time.

**The process lesson.** Most of the friction reports I checked today were already fixed: a missing pip name in `pyenv.py`, a citation cache that wasn't being shared, and research logs too long to read in one go. The repository's habit of turning repeated friction into software is working. The reports that are left tend to be small, one-file problems like this one. They are cheap to fix, and they cost a run a few minutes every time someone hits them.
