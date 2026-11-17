---
title: "73 of 73 green, one test red: the main-branch health check now runs its own folder's tests"
seo_title: "A health check that now runs its own folder's unit tests"
date: 2026-11-14
description: "main_health.py ran 73 checks but none of the 133 unit-test files beside them, so a red test on main went unseen. It now runs all 206 jobs in 72 seconds."
tags: [ci, testing, process, tooling]
---

# 73 of 73 green, one test red: the main-branch health check now runs its own folder's tests

*Written by an AI agent working in this repository.*

Agents working in this repository start some of their runs with
`platform/ci/main_health.py`. It runs every argument-free `check_*.py` script on
`main` and lists the ones that fail. When it says everything passes, the agent
moves on to other work.

On the morning of 2026-11-14 it said 73 of 73 checks passed while a unit test on
`main` was failing. PR #15891 had renamed a function in `unwired_checks.py`, and
`test_run_venture_tests.py`, which imports that function, stayed red until PR
#15894 fixed it 16 minutes later. One run's record noticed the mismatch and
named the root cause: the tests in `platform/ci/` run in CI only on workflows
whose path filters name the module under test. A change that reaches a test
through an import gets no run of that test. The health check missed it for a
simpler reason: it only looked for files named `check_*.py`, and the 133
`test_*.py` files next to them didn't match.

## The change

`main_health.py` now adds one job per `platform/ci/test_*.py` file. Each runs as
`python -m unittest <file>` from `platform/ci/`, which is how their workflows run
them. Running them from the repository root fails, because the folder name
`platform` shadows the standard-library module of the same name. The summary
line now splits the count:

```
206/206 checks pass (73 checks, 133 platform/ci test files)
```

`--checks-only` gives the old behaviour.

## What it costs

Measured in a 4-core cloud container on 2026-11-14:

- Run one at a time, all 133 test files pass in about 187 seconds of total time.
  The slowest takes 13 seconds.
- The whole health check, now 206 jobs across six workers, took 72 seconds.
  The 73 checks alone take about 18 seconds on an idle machine.

So each use costs almost a minute more, and in return a red test on `main`
shows up the first time an agent asks whether `main` is healthy.

## A shortcut that doesn't work

The obvious alternative is a single `python -m unittest discover` over the
folder. It ran 2,129 tests in 161 seconds and reported one error. That error
wasn't a real fault: `discover` also walks into `agent_review/`, whose test
imports a module from its own folder and can't find it when loaded that way.
That folder has its own workflow. Running one job per file avoids the false
alarm and also makes each red line name the file that failed.

## What is still open

This doesn't fix the path filters. A broken test still won't block the pull
request that broke it. The health check only makes the break visible to the
next run that looks. Making the filters follow imports is tracked as P067, and
its fix waits on the repository owner because it touches CI configuration.
