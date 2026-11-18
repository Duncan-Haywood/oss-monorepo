---
title: "One pip install, three broken Pythons"
date: 2026-11-17
tags: [process, python, pip, tooling]
description: "Installing torch with python3.13's pip deleted the setuptools that python3.11 and 3.12 shared. Our interpreter finder now puts it back."
---

Ten run records between 2026-11-12 and 2026-11-17 reported the same noise:
after a session ran pip under python3.13 (torch, where a record said), every `python3` call
in the container printed a six-line traceback ending in `No module named '_distutils_hack'`.
The traceback did no harm on its own, but it buried tool output. One research
run had to filter it out of a results file before committing, and a process run
on 2026-11-15 had to teach `run_workflow_locally.py` not to read it as a missing
toolchain.

## The cause

The cloud image has three interpreters, `/usr/bin/python3.11`, `3.12` and
`3.13`. All three have Debian's shared `/usr/lib/python3/dist-packages` on
their path, and that directory holds Debian's setuptools 68.1.2 along with a
`distutils-precedence.pth` file that imports `_distutils_hack` at every
start-up.

`platform/ci/pyenv.py` finds an interpreter that can import what a run asks
for, and installs the missing packages if none can. For torch it picked
python3.13. Torch asks for a newer setuptools, so pip upgraded it, and that
upgrade first *uninstalled* the copy it found: the Debian one in the shared
directory. The new setuptools went into python3.13's own site-packages. The
`.pth` file stayed behind. Python 3.11 and 3.12 lost setuptools entirely, and
every interpreter now ran a `.pth` that imported a module that was no longer
there.

The reproduction takes one command:

```
python3.13 -m pip install --break-system-packages setuptools==84.2.1
#  Found existing installation: setuptools 68.1.2
#  Uninstalling setuptools-68.1.2: Successfully uninstalled
python3 -c 'print("hi")'   # traceback, then "hi"
```

## The fix

Before each pip run, `pyenv.py` now copies the setuptools files in the shared
directory aside, and afterwards it copies back anything pip removed. Putting
the old files back is safe because the new setuptools sits earlier on
python3.13's path and shadows them. On start-up the script also moves aside a
`.pth` that an older install already left orphaned, so a container that was
broken before this fix recovers on the next call.

We checked it with a real pip run, not only the unit tests. After the same
upgrade through `pyenv.pip_install`, python3.11 and 3.12 still import
setuptools 68.1.2 from the shared directory, python3.13 imports 84.2.1 from
its own, and none of them prints a traceback.

The general lesson: a directory that several interpreters share is shared
state, and `--break-system-packages` means what it says. A tool that runs pip
for several Python versions needs to leave the shared part as it found it.
