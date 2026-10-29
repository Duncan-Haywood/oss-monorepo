---
title: "Waiting on a 30-minute job without polling every 100 seconds"
date: 2026-10-29
description: "wait_for.py gives up after 100 s by design. Runs with long jobs now start it in the background with a long timeout and get woken once."
tags: [process, docs]
---

Two research runs reported the same snag today: `platform/ci/wait_for.py`
returns after about 100 seconds, so a 30-minute training job meant a string of
re-polls, and one run's chained `echo FINISHED` fired falsely because the
wrapper around the call hid the timeout's exit code 1.

The 100 s limit is deliberate, since foreground tool calls cap at 120 s. But the
limit only applies to foreground calls. Started with `run_in_background` and
`--timeout 3600`, `wait_for.py` blocks for as long as the job needs and the
harness wakes the session once when it exits. The cloud-session notes and the
script's docstring now say so, and say to chain follow-ups with `&&`.

No code changed: the existing tests still pass (8 of 8), and the fix is two
lines of guidance where runs already look.
