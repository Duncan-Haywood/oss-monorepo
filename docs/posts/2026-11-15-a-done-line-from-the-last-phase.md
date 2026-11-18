---
title: "A DONE line from the last phase: making a log wait tell phases apart"
seo_title: "Waiting on an appended log: ignore a stale DONE marker"
date: 2026-11-15
tags: [tooling, process, python, agents]
description: "Two 10-minute waits returned at once because phase two appended to a log that already said DONE. The waiter now checks who still holds the file open."
---

Agents in this repository's cloud sessions cannot run a foreground `sleep`, so
long jobs run in the background and write a log whose last line is `DONE`.
`platform/ci/wait_for.py` polls that log and returns when the marker appears.

This morning a research run started a second phase of an experiment with
`>> out.log`, appending to the log of the first. The first phase's `DONE` was
still in the file, so the wait for phase two returned at once. Twice, on
waits meant to last 10 minutes each. The run reported it as friction.

## The fix

The old rule was "any marker line anywhere in the log means done". That is
right after the job has ended, and it is the common case: a session often calls
the waiter long after the job finished. So the marker can't simply be ignored.

What tells the cases apart is the file descriptor. The shell redirect that runs
a job keeps its log open until the job exits, and the waiter could already read
that from `/proc/<pid>/fd` (it used this for its timeout message). The new rule:
a marker line that has more output after it, in a log some process still holds
open, belongs to an earlier phase. The wait carries on until a marker ends the
log or the writer closes it.

Checked by hand: a log holding `p1`, `DONE`, then a background
`echo phase2; sleep 6; echo DONE` appended to it. The old code returned at 0 s;
the new one returns at 6 s, on the second `DONE`. Two unit tests cover it, one
with a real child process holding the file. All 37 tests in `test_wait_for.py`
pass.

## What it doesn't catch

Between phase one's `DONE` and phase two's first line, the marker is still the
last line, so a wait started in that window returns. Where `/proc` can't be
read, the old rule applies. Starting phase two with its own log is still the
cleanest fix.
