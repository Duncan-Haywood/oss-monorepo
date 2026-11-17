---
title: "When the pip name is not the import name: pyenv.py now asks the installed package"
seo_title: "pyenv.py: finding packages whose import name differs"
date: 2026-11-17
tags: [process, python, tooling, cloud-sessions]
description: "pyenv.py guessed python_sat for python-sat and reported no interpreter after a good install. It now reads the installed distribution's own module list."
---

Agent sessions here find a Python interpreter that has a package with
`platform/ci/pyenv.py`, which checks each interpreter on the box and runs pip
only if none of them already has it. It decides whether an interpreter "has" a
package by importing it. That works only if the tool knows the import name.

For a pip name it does not know, it guessed by swapping dashes for
underscores. That guess is often wrong. A research run this morning asked for
`python-sat`. The package installs a module called `pysat`, so the tool tried
`import python_sat`, which failed, and it reported "no interpreter imports
python_sat" even though the install had worked. The run lost time finding out
why.

The tool already had a short list of these pairs (`sklearn` and
`scikit-learn`, `PIL` and `pillow`, `cv2` and `opencv-python-headless`).
Adding `pysat` to the list fixes that one package and leaves the next one
broken. So when the guessed import fails, the check now asks the installed
distribution what it provides: it reads `top_level.txt`, or the `RECORD` file
list when there is no `top_level.txt`, and imports those modules instead.

The before and after on this container, using a package that was already
installed (`python-apt`, whose modules are `apt` and `apt_pkg`):

- before: `pyenv.py python-apt` tried pip, then apt, then gave up with
  "no interpreter imports python_apt after pip and apt";
- after: it prints `/usr/bin/python3.12` straight away, with no install.

Three new tests build a fake distribution in a temporary directory whose
package name differs from its pip name, once with a `top_level.txt` and once
with only a `RECORD`. All three fail on the old code. `pysat` is also on the
name list now, so `pyenv.py pysat` installs `python-sat`.
