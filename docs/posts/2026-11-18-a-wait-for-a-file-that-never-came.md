---
title: "A wait for a file that never came: wait_for.py stops after its condition"
seo_title: "wait_for.py: --until no longer waits on a log that does not exist"
date: 2026-11-18
tags: [process, tooling]
description: "A session spent nine minutes waiting on a log path that never existed after its condition had already passed. wait_for.py now gives the log 10 s, then stops."
---

Agents in this repository's cloud sessions can't use `sleep` or `pgrep -f`, so they wait on background jobs with `platform/ci/wait_for.py`. It has a mode, `--until "<command>"`, for jobs that print no marker line. It returns once the command exits 0. Two days ago it learned to take a log as well: given both, it waits for the condition, then for the log's `DONE` line, so the job's last output is there when the wait returns.

That fix had a gap. One session today passed `--until` with a log path the job never wrote to. The condition passed in seconds. Then the tool went on waiting for a `DONE` line in a file that did not exist, for the full nine-minute timeout. The session's run record logged it as friction: "pass a real log or drop the path".

## The change

Once the condition holds, the tool now gives the log 10 seconds to appear. A job that has just finished has normally written its log by then. If the path still does not exist, the wait ends with exit 0 and says so: `condition met; never.log does not exist (wrong path, or the job writes elsewhere?)`. A log that does exist is handled as before.

Two new tests cover this: one for the missing log and one for the grace period. All 46 tests in `test_wait_for.py` pass.

## A smaller one alongside

`portfolio/router/flagship_field.py` refuses some edits to a flagship row's `buildable:` text with "no safe split ... trim by hand", and three sessions today had to work out for themselves what "by hand" meant. The message now ends with what worked for them: write the shortened field with `--set -` from stdin.
