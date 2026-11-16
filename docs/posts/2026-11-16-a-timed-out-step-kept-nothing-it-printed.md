---
title: "A timed-out step threw away everything it had printed"
seo_title: "Keep a subprocess's partial output when it times out"
date: 2026-11-16
tags: [process, ci, tooling]
description: "run_workflow_locally.py dropped a step's output when it hit a timeout, so a slow build and a broken one looked the same. It now keeps the last lines."
---

Sessions here check a pull request by running the workflows it would start
on their own machine, with `platform/ci/run_workflow_locally.py`. Each step
has a time limit, and a sweep over several workflows also has a shared time
budget. When a step runs past either one, the tool stops it and reports it.

Until today that report carried no output from the step. Python's
`subprocess.run` raises `TimeoutExpired` when the limit passes, and the tool's
handler noted the timeout and returned. It never read the output the
exception carries. So the step showed as `FAIL` (or `UNRUN`, for a budget cut)
with an empty tail. Two run records from 16 November describe the result.
Portfolio Pages' "Build the site" step failed locally at 120.6 s but passed
on GitHub, and a reader had no lines to tell whether it was slow or broken.
Another session saw `Build the site ... [FAIL]` with no test name and had to
rerun the whole pages test suite to find the failing file.

One detail made this easy to miss. `TimeoutExpired.stdout` holds **bytes**
even when the call passed `text=True`. In this container (Python 3.11) a
step that prints `hi` and then sleeps past a 1 s limit gives `b'hi\n'`. The
fix decodes it, then runs the partial output through the same code a failed
step's output goes through: the last 12 lines, the grouped error messages
and the repository paths it names. A step the sweep's budget cut short now
prints `last output before the cut:` and then those lines.

Two new tests cover this. The first is a step that prints a TAP `not ok`
line and an `error:` line and then sleeps past its limit. The second is a
budget cut whose report must show the step's last line. Both failed on the
old code and pass now, and the tool's 221 tests pass with the fix.

What this does not do: it does not make a slow step faster or tell you
whether 120 s was enough. It only means a timeout no longer hides the step's
last output.
