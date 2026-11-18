---
title: "Run the command in the same call, not through a shell variable"
seo_title: "pyenv.py runs a command with the interpreter it finds"
date: 2026-11-14
description: "Agents were told to save a Python path in $PY and use it later. Their shells forget variables between calls, so the later command got an empty path."
tags: [process, tooling, python]
---

Many of this repository's Python checks need packages such as `numpy` or `pytest`. The default `python3` in the cloud containers often lacks them. Another interpreter on the same machine usually has them. [`platform/ci/pyenv.py`](../../platform/ci/pyenv.py) finds that interpreter, installing the packages if it has to, and prints its path. The guides said to save the path and use it afterwards:

```
PY=$(python3 platform/ci/pyenv.py pytest numpy)
"$PY" -m pytest research/some-project
```

That works in a terminal. It does not work for an agent whose shell tool starts each command fresh. `PY` is set in one tool call and empty in the next. `"$PY" -m pytest` then fails with a confusing error. Worse, a heredoc fed to an empty `"$PY" -` can run nothing and print nothing, so a script edit is skipped without anyone seeing it. Run records from 13 and 14 November report exactly that. One research run's heredoc edit "silently did not run while the test append did". Of the clusters that `friction_rank.py --live` ranks, the one about `pyenv.py` advice in `research/CLAUDE.md` is the largest whose target file is not owner-gated (42 sessions in 14 days, though not every report is about the variable).

## The change

Everything after `--` now runs with the interpreter that was found, in the same call:

```
python3 platform/ci/pyenv.py pytest numpy -- -m pytest research/some-project
python3 platform/ci/pyenv.py numpy -- -c 'import numpy; print(numpy.__version__)'
```

A script on standard input works too (`-- -` followed by a heredoc). `pyenv.py` replaces itself with that interpreter (`os.execv`). Standard input, standard output and the exit code all belong to the command. Nothing is stored, so nothing is lost between calls. In this session the bare `python3` had no numpy. The `-- -` form picked `/usr/bin/python3.13` and printed `numpy 2.5.3`.

The extra cost is the lookup itself. That was about 3.3 s per call when an interpreter already had the packages (`pytest numpy -- -c pass`). That is small next to a test run, and much less than a heredoc that quietly did nothing.

## Why the tool tells you, not just the guide

The guides that give the `PY=$(...)` advice (`CLAUDE.md`, `research/CLAUDE.md`, the cloud-session notes) need the owner's approval to change. So the tool now points to the new form itself. Every time it prints a path, it adds one line to standard error: if your shell does not keep variables between commands, add `-- <args>`. Agents read that output anyway. Updating the guides is left to an owner-approved change.

Tests: `platform/ci/test_pyenv.py`, 36 pass. One of them runs a script on standard input through the real `pyenv.py` and checks that its output and exit code come back unchanged.
