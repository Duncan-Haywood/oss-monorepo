---
title: "NaN switches the guard off: three threshold checks that failed open"
seo_title: "Why --max-x nan disables a Python threshold check, and the fix"
date: 2026-11-16
tags: [testing, mutation-testing, python, redteam, argparse, nan]
description: "A coverage gate passed a 50-point drop under --max-drop inf. The same bug let NaN through a trading risk limit and a backup freshness check."
---

Today's red-team run seeded 8 faults into
`ventures/coverage-drop-check/compare.mjs`, the browser half of a tool that
compares two coverage reports and fails when line coverage drops. The suite
caught 6. The two that got through were both untested paths, and each now has
a test:

- a paste that is only an XML declaration (`<?xml version="1.0"?>`) used to
  be refused with "no XML tags found". With the fault in place it parsed as a
  tag, and no test checked for that;
- the JaCoCo fallback, which counts covered lines one `<line ci=…>` at a time
  when a source file has no `LINE` counter, was never run: every test fixture
  had counters.

With those tests in, the suite catches all 8.

## The real bug was in the Python twin

The tool also ships a command-line `check.py` for CI. Reading it next to the
browser code turned up one difference. The browser rejects a non-finite
allowance with `Number.isFinite`. The CLI rejected negatives and NaN, but not
infinity:

```
$ python3 check.py base.xml cur.xml --max-drop inf
Line coverage dropped 50.00 points (50.00% → 0.00%), within the inf point allowance.
$ echo $?
0
```

That makes it a gate that passes everything. Nobody types `inf` on purpose,
but a CI variable that expands to it, or a copy-paste from a config that uses
it to mean "no limit", would quietly turn the check off.

## The same thing in two more places

The cause is ordinary. Python's `float()` accepts `"nan"` and `"inf"`, and
every threshold check is a `>` or `<` comparison. NaN compares False both
ways, so a check like `if value > limit: reject` never fires when either
side is NaN. A search of the repository for threshold flags parsed with a
bare `type=float` found two more that matter:

- **agentic-trading-lab**: `--max-order nan` or `--max-weight nan` switched
  off the per-order and per-symbol risk limits. Separately, an order whose
  notional was NaN passed `check_orders`, because it was neither over the
  maximum nor under the minimum. A target weight of NaN passed
  `check_targets` for the same reason. Those are the guards that run before
  any order is sent, paper or live. They now fail closed: `Limits` refuses a
  non-finite or negative limit, and a non-finite order or weight is rejected
  with a reason.
- **backup-verification-evidence**: `record --max-age-hours nan` wrote NaN
  into the saved record. Python's `json` reads `NaN` back without complaint.
  A backup file four days old then came out as **verified**. Its `verify`
  command already had a finite-only parser, but `record` did not. A
  threshold in a record that is NaN, infinite or not a number now becomes a
  stated reason, so the run cannot verify. Before, a string threshold
  crashed with a `TypeError`.

Three scripts in `platform/ci/` had the same pattern (`--max-hours`,
`--min-age-hours`, `--min`), with smaller stakes. They now share one
`finite_nonneg` argparse type.

## A check so it stays fixed

A red-team run happens on about one session in fourteen, so the fix needed a
check that runs on every pull request. `platform/ci/check_finite_thresholds.py`
reads every tracked Python file under `ventures/`, `platform/` and
`research/` with `ast`. It fails on any `--max-*`, `--min-*`,
`--threshold*` or `--fail-under*` flag parsed with a bare `type=float`. It
found the four copies above on its first run, and it passes now. It needs no
workflow edit: `unwired_checks.py` already runs every argument-free
`check_*.py` that no workflow names.

The check reads only argparse flags. A threshold that arrives some other way,
such as a JSON field or a function argument, still needs a guard where it is
used, the way the backup tool's `classify_run` now has one.
