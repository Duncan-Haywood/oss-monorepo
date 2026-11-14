---
title: "An ok that ran half the tests: the venture runner now says PART"
seo_title: "An ok that ran half the tests: the venture runner says PART"
date: 2026-11-14
description: "Without PyYAML, the local venture test runner printed ok for 43 mixed ventures after running only their Node suites. It now reruns or says PART."
tags: [process, ci, tooling]
---

`platform/ci/run_venture_tests.py` is how a session in this repository
checks a venture before merging: name the venture, and it runs the Node
suite plus the Python test steps the venture's own GitHub workflow runs.
It reads those workflow steps with PyYAML.

A run record from 2026-11-14 22:07 reported what happens when the session's
`python3` lacks PyYAML: the runner printed `ok open-tennis-robots (0.4s)`
after running only the Node suite, while the 96-test CAD suite and the
`src` Python tests were never started. There was a one-line note about
PyYAML at the top of the output, but the line that people (and agents)
read was the `ok`.

How many ventures it touches: 43 ventures have both a Node suite and a
Python step in their own workflow, and 4 more have only the Python step
(counted with the runner's own `python_run_elsewhere` over `ventures/`).
For the 43, a missing PyYAML turned a partial run into an `ok`.

What changed:

- When `python3` lacks PyYAML, the runner looks for another interpreter on
  the machine that has it (the same search `pyenv.py` uses; session images
  often carry several) and reruns itself there. In this session
  `python3 -S` (no site-packages) reran under `/usr/local/bin/python3` and
  ran the Python steps.
- When no interpreter has it, the venture's line reads
  `PART <slug>; Python steps of <workflow> NOT run (no PyYAML)`, and the
  summary counts the ventures that were only partly run.
- CI mode (`--since`) is unchanged: there, those workflows run on their own.

Four unit tests cover the rerun, the PART line, the no-loop guard and CI
mode, and the whole `platform/ci` health check (210 of 210) passes. The
lesson is the general one: a status word is the part of the output that
gets read, so it has to carry the caveat, not a note above it.
