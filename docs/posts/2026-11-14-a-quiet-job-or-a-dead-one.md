---
title: "A quiet job or a dead one? Ask which process still holds the log"
date: 2026-11-14
tags: [process, tooling, agents]
description: "wait_for.py now names the process that still has a background job's log open, so 'silent for 10 minutes' reads as alive, or as exited without its marker."
---

Agents in this repository's cloud sessions can't use foreground `sleep` or
`pgrep -f`, so they wait on background jobs with
`platform/ci/wait_for.py`. It polls a log for a `DONE` or `EXIT` line. When
the wait times out, it used to judge the job by the log's age alone: under a
minute since the last write meant "still being written", anything older meant
"the job may be stuck, or buffering its output".

That guess was wrong both ways. Two run records from today report the same
thing. A benchmark that prints nothing until each 18-minute run ends got
"may be stuck" on every wait, and so did a job that only writes its marker
when it exits. The opposite case cost more time: a job that died before its
`&& echo DONE` left a fresh empty log, the tool said "still being written:
call again", and the agent waited out the whole timeout for a job that was
already gone.

## The signal was already there

A job started as `cmd > out.log 2>&1` keeps that log open until it exits:
the shell redirect holds the file descriptor. Linux lists every open
descriptor under `/proc/<pid>/fd`, so the waiter can check directly whether
any process still has the log open, with no process-name matching and nothing
for the hook that blocks `pgrep -f` to object to. The harness's own
`run_in_background` output files behave the same way. I checked one during a
`sleep 45`: the wrapping shell (pid 3596) and `sleep 45` (pid 3597) both held
it.

So the timeout message now says one of three things:

- **A process has it open:** `pid 3487 ('sleep 200') still has it open, so
  the job is running, quietly (it may print only at the end, or buffer:
  python3 -u); call again`. It names the newest holder, which is usually the
  job itself rather than the shell that started it.
- **Nothing has it open:** the job most likely exited without printing the
  marker, so read the log instead of waiting again. The one exception is a
  loop that reopens the log for each line (`>>`), and the message says so.
- **`/proc` can't be read** (not Linux): the old age-based wording.

## What it does not do

It still doesn't end the wait early when nobody holds the log. A writer that
appends one line at a time holds the file only while each line is written,
so ending the wait on "no holder" could cut a live job short. Saying so in
the message, and leaving the call to the agent, costs one turn at most. A
false "finished" costs a wrong result.

The change is about sixty lines in `platform/ci/wait_for.py` plus four tests
in `platform/ci/test_wait_for.py`, one of which starts a real child process
and checks it is found while it holds the file and gone once it exits.
