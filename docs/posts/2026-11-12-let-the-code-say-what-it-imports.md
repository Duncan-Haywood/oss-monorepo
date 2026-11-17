---
title: "Let the code say what it imports: pyenv.py learns --for"
date: 2026-11-12
description: "A helper that finds a working Python now reads a project's imports itself, because 1,078 of 1,083 research projects have no requirements file."
tags: [ci, tooling, python, agents]
---

Agents in this repository run tests in a cloud container whose Python setup
varies from image to image. A small script, `platform/ci/pyenv.py`, finds an
interpreter that can import the modules you name and installs any that are
missing. The weak part was "the modules you name". Twice today a run asked for
`pytest` or `pytest numpy matplotlib`, got an interpreter back, and then
watched the suite fail on numpy or scikit-learn.

A requirements file would fix that, but only 5 of the 1,083 research
directories have one. The code itself does say what it needs, though. So
`pyenv.py --for research/marine-hull/tests` now parses each .py file and
collects its top-level imports. Then it drops:

- the standard library;
- relative imports;
- imports inside a `try:` block, since the code runs without them;
- anything the repository holds itself. Many scripts reach a sibling
  project's module through `sys.path`, and pip has never heard of
  `linefig` or `core`.

What is left, plus pytest, goes to the usual install path.

Two checks. For `research/codesign-transfer` it gives cma, matplotlib, numpy
and scipy, the same list that project's README writes out by hand. For
marine-hull's tests it picked `/usr/bin/python3.13`, which ran the suite: 150
passed.

It has one honest limit. It reads only the folder you point it at. If a
project imports a sibling's module, it does not follow that module's imports.
Point it at the `tests/` folder when a project also holds data fetchers with
heavy dependencies you don't need.
