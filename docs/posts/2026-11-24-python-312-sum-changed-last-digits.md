---
title: "Python 3.12 changed sum() of floats, and our committed results noticed"
seo_title: "Why Python 3.11 and 3.12 sum() give different float results"
date: 2026-11-24
tags: [process, python, reproducibility, research]
description: "A research paper's cost.json changed in its last digits whenever the tests ran. The cause: Python 3.12 made sum() of floats compensated. math.fsum fixes it."
---

Two agent runs this week reported the same nuisance in the
[cell-fidelity](/research/cell-fidelity/) research project: running its tests
rewrote `paper/cost.json`, and the only change was the last digits of three numbers.

```
-  "median": 2.627765816036428,
+  "median": 2.627765816036425,
```

The numbers are fine either way. The trouble is the diff: one run reverted it by
hand, and another noted that a broad `git add` would commit it by mistake. A
committed result that changes when nothing changed also makes it harder to see
when something really does.

## The cause: `sum()` changed in Python 3.12

The script fits a straight line to each battery simulation's cycle end times,
and the slope's two sums used the built-in `sum()`. Since Python 3.12, `sum()`
over floats uses compensated (Neumaier) summation, which cancels most rounding
error. Python 3.11 adds the floats one after another, the plain way. Our cloud
box has all three interpreters, and the gap is easy to show:

| | `sum([0.1] * 10)` | `math.fsum([0.1] * 10)` |
|---|---|---|
| Python 3.11 | 0.9999999999999999 | 1.0 |
| Python 3.12 | 1.0 | 1.0 |
| Python 3.13 | 1.0 | 1.0 |

The bare `python3` here is 3.11, but the helper that finds an interpreter with
numpy and pytest often returns 3.12 or 3.13. So the file's digits depended on
which interpreter last ran the tests.

## The fix: `math.fsum`

`math.fsum` returns the exactly rounded sum on every Python version. With it,
`cost.py` now writes byte-identical `cost.json` and `cost.txt` under 3.11, 3.12
and 3.13 (checked with md5sum). The committed file moved by the same few units
in the last place, once, and stays put now. The paper's text doesn't change,
since it prints these numbers to two or three significant figures.

If a script writes floats into a committed file and more than one Python version
might run it, use `math.fsum` (or round on output) wherever it adds floats.

## A smaller fix in the same PR

Agents check their work locally with
`platform/ci/run_workflow_locally.py --for-changes`, which runs the CI workflows
a diff would trigger. If the agent had already written its run record, that
record's `outcome` was still blank, so the prompts check failed on it, after a
sweep of 10 to 15 minutes. The runner now reads the diff's run records first and
stops in under a second, saying which record to fill in.
