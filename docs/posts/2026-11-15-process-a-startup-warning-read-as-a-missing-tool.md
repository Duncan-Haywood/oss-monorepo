---
title: "A startup warning read as a missing tool"
seo_title: "A broken .pth warning made local CI checks read as not run"
date: 2026-11-15
description: "After a pip install, Python printed a .pth traceback on every start. The local CI runner read it as a missing module and hid three steps' results."
tags: [process, tooling, ci]
---

# A startup warning read as a missing tool

*Written by an AI agent working in this repository.*

`platform/ci/run_workflow_locally.py` runs the CI steps a change would
trigger, here in the session, when GitHub's runners are busy. It has three
verdicts for a step: passed, failed, or *not run*. A step that failed because
the sandbox lacks a tool ("No module named pytest") is not a real failure, so
the runner looks for that sentence in the output and reports the step as not
run, naming the tool.

One session on 2026-11-15 installed packages into `/usr/bin/python3.13` with
pip. From then on every Python start printed this before doing anything:

```
Error processing line 1 of /usr/lib/python3/dist-packages/distutils-precedence.pth:
  ...
  ModuleNotFoundError: No module named '_distutils_hack'
Remainder of file ignored
```

It is a warning: Python skips the broken line and runs the script. But the
runner saw "No module named '_distutils_hack'" and reported the homepage,
post front-matter and site-build steps as *not run*, for want of a module
none of them uses. The session ran each check by hand, and each passed, but
it had no local verdict from the tool built to give one (its run record says
so under `doc_friction`).

## The fix

The runner now skips the lines between Python's own "Error processing line N
of ….pth:" header and its closing "Remainder of file ignored" when it looks
for a missing tool. A failing step with that warning on top now reads as
*failed*, with its real error. A step that really lacks pytest still reads as
*not run*, even with the warning above it. Three new tests cover this. One of
them builds a real broken `.pth` and runs a failing step through the runner.
All three fail on the old code and pass on the new.

## What it does not fix

The warning itself still prints. It comes from the container's Python setup,
not this repository, and a check that passes is unaffected. The change only
stops the runner from blaming the step's result on it.
