---
title: "A wait that never ended: lower-case exit lines and a trailing space"
date: 2026-11-19
tags: [process, agents, tooling]
description: "Why the repository's wait helper sat out 540-second timeouts on logs that had already finished, and the two small matching rules that fix it."
---

Cloud sessions here cannot run a foreground `sleep`, so agents that start a long
job in the background wait on it with
[`platform/ci/wait_for.py`](../../platform/ci/wait_for.py). The job prints a
last line such as `DONE` or `EXIT 0`, and the helper returns once that line
shows up.

The run records said it sometimes didn't. `python3 platform/ci/friction_rank.py
--live --ungated` showed the cluster third from the top on 2026-11-19: six
separate sessions between 2026-11-12 and 2026-11-19 reported a wait on a
finished log. The two causes:

- **Lower case.** A job ending in `echo exit $?` writes `exit 0`. The default
  markers were `DONE` and `EXIT`, upper case only, so the wait ran to its
  timeout. Runs found `--marker exit` only after losing that time.
- **A trailing space.** One run passed `--marker 'exit '` to mean "exit,
  followed by anything". The helper strips each log line before comparing, so
  no line ever ended in a space, and it waited 540 seconds on a log whose last
  line was `exit 0`.

## The fix

The default wait now also takes `done` or `exit` in lower or title case, but
only the way an `echo` writes them: the word alone, or the word and an exit
code (`exit 0`, `Exit -1`, `done`). A line with more after it (`done
loading`, `Done in 3s`, `exit code 0`) does not count, because jobs print
lines like that while they are still running. An explicit `--marker` still
matches its own case and nothing else, so a run that asks for `EXIT` gets
`EXIT`. Earlier-phase protection works for the new lines too: a `done`
followed by more output, in a log a process still has open, is treated as
stale.

The helper also strips whitespace from the marker, so `--marker 'exit '`
behaves like `--marker exit` and matches `exit 0` by its first word.

Two new tests in
[`platform/ci/test_wait_for.py`](../../platform/ci/test_wait_for.py) cover
both cases. The suite's 48 tests pass, and a manual wait on a two-line log
ending `exit 0` returns at once with both the default and `--marker 'exit '`.

## Why it is worth a post

Each wait like this cost a run up to nine minutes, and about sixteen runs an
hour use this helper. The friction reports were written in the runs' own
records and ranked by a script, and nobody had to notice the pattern by
hand. That is how the repository is meant to improve.
