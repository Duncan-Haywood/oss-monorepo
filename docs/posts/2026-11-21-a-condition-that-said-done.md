---
title: "A condition that said done, and a wait that kept waiting"
date: 2026-11-21
tags: [process, agents, tooling]
description: "Why the wait helper's --until timed out on finished jobs whose logs had no DONE line, and how an open file descriptor settles it."
---

Agents here start long jobs in the background and wait on them with
[`platform/ci/wait_for.py`](../../platform/ci/wait_for.py), because cloud
sessions block a foreground `sleep`. It has two ways to tell that a job is
done. One is a marker line such as `DONE` at the end of the log. The other is
`--until "<command>"`, which waits until that command exits 0.

Pass both and the helper waited for both. That rule came from a friction
report on 2026-11-16: a run's condition held while the job was still
writing its last line, so "condition met" arrived before the output it was
meant to show. Requiring the marker as well fixed that case. It broke a
different one.

## The two reports

`promptctl.py measure` listed two records from the last day in the
`wait_for.py` cluster:

- 2026-11-21 00:26: the condition was a check on the background task's own
  output file, which the harness ends with `[exited with code N]`. The
  condition held, then the helper waited 100 s for a `DONE` the log never
  got, and timed out on a job that had finished.
- 2026-11-21 14:07: the job ended its log with a custom `PDKDONE`. The
  condition held, and the helper waited on the default `DONE`/`EXIT`
  markers until it timed out.

In both cases the condition was right and the marker was the wrong signal.

## The fix

The helper can already see which processes have a file open. It reads
`/proc/*/fd`, the same check that lets a timed-out wait say whether a job
is alive or exited without its marker. A shell redirect holds the log open
until the job ends. So once the `--until` condition holds, the wait now
ends on whichever comes first:

- the marker line, as before; or
- **no process has the log open any more**, which means the writer is done,
  so the helper prints the log's tail and exits 0.

A log that something still has open goes on waiting for its marker, so the
2026-11-16 case is still covered. If `/proc` can't answer, nothing changes
and the helper waits for the marker. Without `--until`, a closed log with no
marker still times out as before, because then the marker is the only
signal the caller gave.

## Checked

Three new tests went into
[`platform/ci/test_wait_for.py`](../../platform/ci/test_wait_for.py), and the
2026-11-16 test now states its premise: a job that still holds the log open.
All 52 tests pass. By hand, a closed log ending in `PDKDONE` with `--until`
returned in 0.05 s. A live `(sleep 3; echo PDKDONE) > log` job was waited on
until its writer closed the log, and the helper returned 0 with the tail.

Each of these timeouts cost a run 100 to 540 seconds, and about sixteen runs
an hour use the helper. That makes it one of the cheaper places in the
repository to save time.

## Update, 2026-11-26: a pattern is not a command

The same flag drew a different mistake five days later. Runs passed a log and
the text they hoped to see in it, `wait_for.py job.log --until "pass 5"`. The
helper ran `pass 5` as a shell command, the shell answered 127 ("not found")
on every poll, and the wait ran to its timeout: four run records on
2026-11-26 report waits of 110 to 580 seconds. An earlier fix that day caught
a single bare word (`--until EXIT`) but let anything with a space through,
with only a warning.

Now, when a log is given, no `--marker` is set and the `--until` command
cannot be found, the helper reads the text as the log's marker and says so.
With an explicit `--marker`, or with no log, `--until` stays a command, so a
wait for a tool that is still being installed works as before. CLAUDE.md's
one line on waiting now names `--marker` for a custom last line. The helper's
61 unit tests pass.
