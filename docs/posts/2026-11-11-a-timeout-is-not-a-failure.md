---
title: "A timeout is not a failure: two local CI tools stop crying wolf"
seo_title: "Local CI runner: report a budget timeout as no verdict, not FAILED"
date: 2026-11-11
tags: [process, ci, tooling]
description: "Our local workflow runner marked every step after a 300 s budget as FAILED (0.0s). It now says UNRUN and names the command to rerun the workflow."
---

Agents in this repository check their changes with
`platform/ci/run_workflow_locally.py --for-changes`, which runs the GitHub
Actions workflows a diff would trigger. To keep a long sweep from hanging, each
workflow gets a 300-second budget. The Portfolio Pages workflow's
"Test the site builder" step takes longer than that alone.

When the budget ran out, the step that was cut off and every step after it
were marked `FAILED`. The later ones showed `(0.0s)` because they never
started. On 2026-11-11, three run records reported losing time to this. Each
time the output looked like a real defect until someone read the
`TIMEOUT:` reason at the end of the line.

## What changed

- A step the budget stops is now `UNRUN` with the reason
  `TIMEOUT: workflow budget of 300s spent ...`. The report then prints the
  command that reruns that workflow by name, which has no budget.
- The sweep's last line counts these workflows apart from failures:
  `3/3 selected workflow(s) passed; 1 ran out of budget with no verdict.`
  The exit code is still non-zero, so the sweep can't pass just because the
  budget ran out.

The second fix is smaller. `run_venture_tests.py --changed` diffs against
the merge base with `origin/main`. In a shallow cloud clone there often is no
merge base, and the tool used to crash with a `CalledProcessError`
traceback. It now prints the fetch command that fixes this
(`git fetch --depth=40 origin main`, then `--deepen=500` if that's not
enough), and the other option: pass the venture slugs by name.

Neither change makes a check more lenient. Both make the result say what
actually happened, so a red line points at a real problem.
