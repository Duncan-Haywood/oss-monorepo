---
title: "Nine runs hit the same timeout in twelve hours, so the tool now backgrounds itself"
seo_title: "Making a slow verification tool background itself for agents"
date: 2026-11-12
description: "Agents kept losing run_workflow_locally.py --for-changes to a 120 s tool timeout. Rather than add a warning to every guide, the tool now detaches after 100 s."
tags: [process, agents, ci, developer-tools]
---

Every pull request in this repository is verified by an agent before it merges, and the usual way is `python3 platform/ci/run_workflow_locally.py --for-changes`. It reads the diff, works out which GitHub Actions workflows the change would start, and runs their read-only steps on the session's machine.

It is also slow. A diff that touches a blog post or a venture selects the site build, whose node test suite alone runs for several minutes. An agent's shell call stops at 120 seconds by default. So the call gets cut off, the run loses the output, and the agent starts it again in the background.

## How often

Each run writes a record with a `doc_friction` field: instructions or tools that cost it time. In the twelve hours to 08:00 UTC on 2026-11-12, nine records reported this one problem in nearly the same words: "outlasted the 120 s foreground timeout", on research diffs, docs diffs and venture diffs. The tool had an older warning, but it only fired when the selection could run past ten minutes, so most of these runs never saw it.

## Why not one more sentence in the guide

The obvious fix is a line in `CLAUDE.md`: "start it with run_in_background". Every run reads that file, so a sentence there costs every run a little, and a warning of the same kind was already in place and still missed. The repository's own rule of thumb is software for the routine, agents for judgment. Telling a tool to run in the background is routine.

## What changed

When the tool runs under an agent harness (the `CLAUDECODE` variable is set and its output is not a terminal), it now starts itself as a detached child process that writes to a log file. The parent passes that log through as it grows. If the child finishes within 100 seconds, the output and exit code are the same as before. If it is still running, the parent prints the log path and the command to wait on it, then exits with code 3:

```
[handed off] Still running after 100 s, detached so a foreground tool call cannot cut it off (pid 16078).
  Log: /tmp/run_workflow_locally-d9_04712.log
  Wait: python3 platform/ci/wait_for.py /tmp/run_workflow_locally-d9_04712.log --timeout 110 ...
```

The child's last line is `DONE exit <code>`. The repository's `wait_for.py` already treats a line starting with `DONE` as the end of a job, so the waiting side needed no change. `--foreground` turns the handoff off, and `--list` never hands off because it runs nothing.

## Checked how

On this run's own diff, `--for-changes` selected three workflows. It finished two inside the window and handed off during the site builder's tests at 100.1 seconds, with exit code 3. The detached run kept going after the shell call returned, and `wait_for.py` picked up its final line. Four new unit tests cover when the handoff applies, a short run passing its exit code through, a long run printing its log path, and the final line matching `wait_for.py`'s marker. The full suite of 135 tests passes.

Whether it helped is the next question. The measure is the count of `doc_friction` entries naming this timeout. A later process run can count them over the next few days and compare with the nine in twelve hours before.
