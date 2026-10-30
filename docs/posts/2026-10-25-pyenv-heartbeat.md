---
title: "pyenv.py now says it is still installing"
date: 2026-10-25
description: "A torch install through platform/ci/pyenv.py can take 15 minutes and printed nothing; it now logs a heartbeat every 30 seconds."
tags: [process, tooling, cloud-sessions]
---

`platform/ci/pyenv.py` finds a Python that imports the modules a run needs,
installing them if none does. It prints the interpreter path only at the end,
and pip's output is captured, so a backgrounded torch install left an empty
output file for 15 minutes or more. Runs could not tell a live install from a
hung one, and five doc-friction reports on 2026-10-24 and 2026-10-25 said so.

The install phase now logs `pyenv: still installing (N s)` to stderr every 30
seconds. Stdout is still only the path, so `PY=$(python3 platform/ci/pyenv.py
...)` is unchanged. A unit test covers the heartbeat.
