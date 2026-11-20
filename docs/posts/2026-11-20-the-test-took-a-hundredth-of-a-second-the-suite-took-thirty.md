---
title: "The test took a hundredth of a second; the suite took thirty"
seo_title: "Why a Python test suite waits 30 s: an orphaned child holds the pipe"
date: 2026-11-20
description: "Two test-only bugs, an orphaned sleep holding stdout and a unit test that ran git fetch, cut a 157 s CI step to 95 s with no check removed."
topic: infrastructure
tags: [performance, ci, python, testing, subprocess]
---

# The test took a hundredth of a second; the suite took thirty

Every pull request in this repository that touches a product runs one job,
"ventures tests". Since mid-November it also runs 265 small checks and test
suites that no other workflow covers. On 2026-11-14 that extra step took 42
seconds. By today it took over two minutes on every job, even when the
product's own tests finished in one second.

Timing each of the 265 items inside the worker pool found two that had
nothing to do with the code they were testing.

## A `sleep` that outlived its test

One test checks that a "wait until this process is gone" helper sees a
process by name. It starts `sh -c "sleep 30 # some-tag"`, checks the helper,
then calls `kill()` on the process it started.

That kills the shell. The `sleep` the shell started is a separate process,
so it keeps running for its full 30 seconds. It also holds a copy of the test
run's standard output. Whatever reads that output, whether CI capturing it or
a `| tail` in a terminal, waits for the pipe to close. Every test passed in
2.5 seconds, but the suite took 30.

The fix is to start the shell in its own session and kill the whole process
group, so the `sleep` dies with it. The suite now takes 2.5 seconds.

## A unit test that fetched

The second was a unit test for a report tool. It ran the tool's `main()`
with its defaults. Those defaults deepen the shallow clone with `git fetch`
and read open pull requests from the GitHub API. In a unit test that only
checked one count, that meant a real network fetch on the real checkout. It
took 7 seconds alone and 78 inside the pool, and it slowed every other git
command running beside it.

The neighbouring tests already stub git and the API. This one now does the
same, and it fails if it ever tries to fetch.

## The numbers

On a 4-core container, the whole step went from 157 seconds to 94 and 96
seconds over two runs. No check was removed and no assertion was weakened:
the same 265 items run and pass. Across the roughly 24 ventures-tests jobs we
see in 75 minutes, that frees about a minute of runner time per job.

Both bugs are easy to miss because the test itself looks fast. If a suite's
wall time is much longer than its tests add up to, check what is still
holding its output after it finishes.

The full reading, the profile and the ranked list of what is left are in
[`docs/history/ci-perf-2026-11-20-unwired-orphans-and-fetch.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-20-unwired-orphans-and-fetch.md).
