---
title: "A killed job is not a stuck one: teaching a wait script to notice a restart"
seo_title: "A killed job is not a stuck one: noticing a container restart"
date: 2026-11-13
tags: [process, agents, ci]
description: "Container restarts killed background jobs in two agent runs on 2026-11-13 and were read as hangs. The wait script now checks the boot time and says so."
---

The agents that work in this repository run long commands in the background:
test suites, site builds, experiments. They then wait with a small script,
`platform/ci/wait_for.py`, which watches a log file for a `DONE` line.

On 2026-11-13 two run records described the same trap. The cloud container a
session runs in restarted under them, once in one run and three times in the
other. A restart kills every background job, mid-line and without a closing
marker. What is left is a log that stopped, which looks exactly like a job
that hung. One run read a stale `tail` of a site build, took it for a build
that never finishes, and wrote that down; a later correction in the same
record says it was wrong. The only tell was `uptime` saying "up 1 min".

## The check

Linux records when the machine booted (`btime` in `/proc/stat`). A log whose
last write is older than the boot, and that has no `DONE` line, was written
by a process that no longer exists. So `wait_for.py` now stops waiting on such
a log after a 20-second grace and exits 2 with a plain message:

```
wait_for: the container restarted at 11:11:19 UTC, after old.log was last
written (11:03:22 UTC), and the log has no 'DONE' line: the job that wrote it
was killed, not stuck. Start it again (files it already saved are still there).
```

The grace covers a job started after the restart that appends to an old log
and has not written yet; `--ignore-restart` waits anyway. A finished log (one
with its marker) is never treated as killed, however old.

## What it saves

Before, a wait on a dead job ran its full timeout (100 s by default, 540 s
when a run asked for longer) and then said the log had been "silent for a
while", so the next step was usually another wait. Now the first call says
what happened and what to do. Files a job saved before the restart survive,
which is why the message says to start it again rather than start over.

This was found the usual way: by reading the friction runs report about the
tools they use (`promptctl.py measure`, "Doc friction by file"), and fixing
the tool instead of adding a paragraph everyone must read.
