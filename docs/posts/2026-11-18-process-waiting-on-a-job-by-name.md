---
title: "Waiting on a background job by name, without the wait finding itself"
seo_title: "Waiting on a job by name without pgrep matching itself"
date: 2026-11-18
tags: [process, agents, tooling]
description: "pgrep -f '[n]ame' still matched its own shell when the name appeared twice on a line; one wait never fired in 30 minutes. wait_for.py --gone reads /proc."
---

Agents in this repository start long jobs in the background (a benchmark, a survey over 39 files, a solver batch) and then wait for them. Waiting on a job you know only by its script name sounds easy: `pgrep -f survey.py` until it prints nothing. It isn't, because the shell running that `pgrep` has `survey.py` on its own command line, so it always finds at least one match: itself.

The usual fix is to bracket a letter, `pgrep -f '[s]urvey.py'`. The pattern still matches `survey.py`, but the literal text `[s]urvey.py` on the command line does not. The session hook here insists on that spelling. It works only while the bare name appears nowhere else on the same line, and on 18 November three runs found lines where it did:

- a waiter that started batch 2 after batch 1 also named `bowling-repeat-sat.py` when it launched batch 2, so the bracketed pattern matched the waiter's own shell. It never fired, and about 30 minutes went by before anyone noticed (a ventures run's `errors` entry);
- a Monitor loop named its output files `coda-check-*.md`, so the bare word was on the line again (a ventures run's `doc_friction`);
- a third run hit the same hook rule from the `pkill` side.

## The change

`platform/ci/wait_for.py`, the repository's wait-without-`sleep` tool, gains a mode for this:

```
python3 platform/ci/wait_for.py --gone bowling-repeat-sat.py --timeout 540
wait_for: waiting on 1 process(es) matching 'bowling-repeat-sat.py': 20477 'python3 bowling-repeat-sat.py --batch 1'
wait_for: no process matches 'bowling-repeat-sat.py' any more
```

It reads `/proc/*/cmdline` itself rather than calling `pgrep`, and it skips its own process and every parent above it, so the shells that started it can name the job as often as they like. It prints what it matched before it starts waiting. A name that matches nothing (a typo, or a job that has already finished) says so and returns at once, rather than looking like a quick success with no explanation. Timeouts work the same way as the tool's other modes: exit 1, the pid still running, and how to wait longer in one call.

Four new tests cover it. One runs the self-match case for real: a shell whose command line contains the name runs `wait_for --gone` on that same name, and the test checks that it reports no match. The tool's suite passes (44 tests) and `main_health.py` was green before the change (273 of 273).

## What is still open

The instructions agents read first (`CLAUDE.md`, `.github/prompts/cloud-session.md`) still teach the bracket trick. Both files are owner-approved paths, so this PR leaves them alone and the pointer lives in `wait_for.py`'s own help for now. The run record suggests a one-line change for the owner: "to wait on a job by name, `wait_for.py --gone NAME`".
