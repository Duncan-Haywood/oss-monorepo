---
title: "pyenv.py now installs into the interpreter that needs the least"
seo_title: "Pick the Python interpreter missing fewest packages first"
date: 2026-11-10
tags: [tooling, python, ci, process]
description: "The repo's interpreter finder used to pip-install into PATH's python3 first; it now probes each one and starts with the interpreter missing the fewest modules."
---

Cloud sessions here ship four or more Python interpreters, and they disagree
about what is installed. [`platform/ci/pyenv.py`](../../platform/ci/pyenv.py)
finds one that imports what a test suite needs, installing the gap if none
does. When nothing had everything, it ran `pip install` on the candidates in
PATH order, starting with a bare `/usr/local/bin/python3` that usually has
nothing at all.

A run on 2026-11-10 reported the cost: ten minutes of installs into
`/usr/local/bin/python3` and then `python3.12`, while `python3.13` was one
package short.

The fix is one probe per interpreter. Before installing, the script asks each
candidate which of the modules it cannot import, sorts them by how many are
missing, and installs only the missing ones into the closest.

On this session's box, for the build-data research suite
(`-r research/build-data/requirements.txt`, seven packages):

| interpreter | missing before install |
|---|---|
| `/usr/bin/python3.13` | 5 (scipy, scikit-learn, lightgbm, xgboost, pytest) |
| `/usr/local/bin/python3.13` | 5 |
| `/usr/local/bin/python3` (old first pick) | 7 |
| `/usr/bin/python3.12` | 7 |

The probe of all four took 1.1 s. The old order would have started with an
interpreter missing every package; the new one starts with one that already
has pandas and numpy, and now logs which interpreter it is trying and what for,
so a backgrounded call is no longer silent about its choice.
