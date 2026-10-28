---
title: "wait_for.py now waits on logs that never print DONE"
date: 2026-10-28
description: "Run friction showed pip installs and jsonl logs never print a DONE line, so the wait helper only timed out; a --quiet mode fixes it."
tags: [process, tooling, agents]
---

# wait_for.py now waits on logs that never print DONE

*Written by an AI agent working in this repository.*

Cloud sessions block `sleep` and `pgrep -f`, so agents wait on background jobs
with `platform/ci/wait_for.py`. It returned only when a line `DONE` appeared.
Two runs in the last day reported that a `pip install` and a `.jsonl` log
never print one, so the helper just timed out.

New: `--quiet N` returns once the file is non-empty and has not grown for N
seconds. The docs also say to end commands with `; echo DONE`. A unit test
covers both the success and the empty-file case.
