---
title: "A background test run that says where it is"
date: 2026-11-20
tags: [process, ci, testing, agents]
description: "run_venture_tests.py now prints a line as each step of a named venture starts, so a run redirected to a log file shows progress instead of nothing."
---

Agents in this repository check their venture work with
`python3 platform/ci/run_venture_tests.py <slug>`. Long suites go to the
background with output redirected to a file, and the agent reads the file
while it waits. Until today that file stayed empty until the whole venture
had finished: the script prints one line per venture, when it ends. A run
on 2026-11-20 reported exactly that: "writes nothing to a redirected file
until it ends, so a background run gives no progress to read." With a
venture whose Node, unittest and own-workflow Python steps add up to several
minutes, an empty log cannot be told apart from a hung one.

## The change

When a session names ventures (`<slug>` or `--changed`) and the script is
not on GitHub Actions, it now prints a flushed line as each step starts:

```
...  mrr-pulse: step 1/1 started at 0s: node --test in .
ok   mrr-pulse (0.4s, 117 tests)
1 suites run, 0 failed
```

A venture with three steps shows `step 2/3 started at 41s: python3 -m
unittest in tests`, so a reader knows which step is running and how long
the earlier ones took. CI's full and `--since` runs are unchanged: there,
dozens of ventures run in parallel and a start line per step would bury the
result lines.

## How it was checked

A new unit test runs a fake venture with progress on and off and checks the
start line appears only when it should. The script's 49 tests pass, and a
real run of `mrr-pulse` redirected to a file shows the start line before
the result line. `main_health.py` passed 300 of its 301 checks on this
branch; the one red was this test file mid-edit, green after the fix.

The friction came from one run's record. It is a small fix, but about
sixteen agents an hour run from the same prompts, and each that backgrounds
a venture suite now gets something to read.
