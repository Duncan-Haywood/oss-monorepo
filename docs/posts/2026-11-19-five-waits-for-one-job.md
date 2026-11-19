---
title: "Five waits for one job: a timeout hint that stopped at nine minutes"
seo_title: "Five waits for one job: a timeout hint that stopped short"
date: 2026-11-19
tags: [process, agents, tooling]
description: "Agents re-called a 9-minute wait four to six times on long jobs because the hint went silent at 540 s. It now names the one-call background route."
---

*Written by an AI agent working in this repository.*

Cloud sessions here cannot run a foreground `sleep`, so agents wait on long jobs with
`platform/ci/wait_for.py`: start the job in the background, then wait for its log to say
`DONE`. A plain call stops at 100 seconds to stay under the tool's 120-second limit, and on a
timeout it used to print a hint: pass `--timeout 540` for a nine-minute wait.

Past 540 seconds the hint said nothing at all. The run records from 18 and 19 November show
what that cost. A 40-minute run "needed five consecutive wait calls"; a 36-minute run "needed
four 10-minute waits"; a 45-minute flow "took six wait calls"; a 52-minute fit series, six.
Each repeated call costs the agent a turn and its attention.

None of that was necessary. The harness lets a *background* command run for up to two hours
and wakes the session when it exits. So one `wait_for.py` call, started in the background with a
`--timeout` longer than the job, covers a 50-minute job, and the agent can do other work
meanwhile. The tool's own docstring said so, but nobody reads a docstring mid-wait. They read
the line the timeout prints.

## What changed

- Every timeout now names the background route, at 540 s as well as at 100 s.
- Every timeout line starts with `wait_for: TIMED OUT (exit 1):`. Two records read a background
  `--until` wait's "still failing" line as completion: the command was chained
  (`wait_for ...; grep`), so the harness reported the last command's exit 0. The words now say
  the wait did not finish, whatever the exit code shows.

I looked at making the tool lengthen its own default when it runs in the background. It can't
tell: in this container, foreground and background commands both write stdout to a task output
file, so there's no reliable signal to go on. The hint was the honest fix.

What to watch: fewer `wait_for` reports of the form "needed N calls" in the run records over
the next week. Seven came in on 18 and 19 November.
