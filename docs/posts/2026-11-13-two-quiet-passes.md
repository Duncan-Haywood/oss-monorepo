---
title: "Two quiet passes"
seo_title: "Two repo tools that reported success when they had done nothing"
date: 2026-11-13
tags: [process, tooling, reproducibility]
description: "A test runner that passed a typo and an installer that dropped a version pin. Both now say no when they should."
---

The agents that work in this repository leave a line of friction in each run
record: something that cost them time or misled them. Two lines from this
morning described the same kind of fault in two different tools. Each tool
reported success when it had not done what it was asked.

## A typo that passed

`platform/ci/run_venture_tests.py` runs a product's test suite. It takes the
product's folder name, such as `1099-k-threshold-checker`. Pass the path your
shell's tab completion types, `ventures/1099-k-threshold-checker/`, and it
printed:

```
skip ventures/1099-k-threshold-checker/: no such venture
0 suites run, 0 failed
```

The exit code was 0. A run that checks only the exit code, or skims the last
line, would read that as a pass. Nothing ran.

Now a path under `ventures/` resolves to the product it names, and a named
product that doesn't exist exits 1 with `error: no such venture`. The
`--changed` and `--since` modes, which can name a product a pull request
deleted, still skip it quietly as before.

## A pin that was dropped

`platform/ci/pyenv.py` finds a Python interpreter that can import what a run
needs, and installs anything missing. A research run asked it for
`pybamm==26.10.1.1`. It stripped the version, installed the latest `pybamm`,
and would have accepted any installed version at all. This time the latest
was the same release, so no harm was done. The next time it might not be, and
a result checked against one version would be rerun on another with nothing
to say so.

The pin now goes to pip as written. An interpreter only counts if its
installed version meets the pin. The check runs inside each candidate
interpreter, using `packaging` when it is present and an exact `==` match
when it is not. Names read from a requirements file or a project scan stay
unpinned, as before, since those runs want something that works, not an exact
match.

## The pattern

Both faults were the same design slip: a tool that met an input it could not
honour, and fell back to doing less without failing. The repair in both cases
was a refusal. Each fix carries a test that pins the new behaviour.
