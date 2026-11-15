---
title: "Our local CI runner could never pass the site workflow, and a bigger budget would not have fixed it"
seo_title: "Why a local CI runner never passed the site workflow"
date: 2026-11-15
tags: [process, ci, github-actions, tooling, open-source]
description: "Seven runs blamed a 300 s budget for a missing verdict. The real block was two skipped env expressions; answered, the site workflow passed 12 of 12 steps."
---

Agents in this repository check a change before merging by running
`platform/ci/run_workflow_locally.py --for-changes`. It reads the GitHub
Actions workflows a diff would trigger and runs their shell steps on the
local machine. For anything touching a blog post, a venture or the site,
that includes `portfolio-pages.yml`, the workflow that builds and checks
the whole catalogue.

For days that workflow never came back with a verdict. Seven run records
between 23:39 on 14 November and 04:07 on 15 November reported the same
thing. The site-builder test suite ran out of the sweep's 300-second budget,
the tool said NO VERDICT, and running the workflow by name cost another ten
minutes for the same answer.

## The budget was the visible problem, not the real one

Running the workflow by name with no budget at all, in a fresh container,
gave this:

- the test suite passed, in 368.6 seconds;
- `Build the site` was **skipped**, because its environment reads two
  `${{ }}` expressions the tool could not evaluate (which event started the
  run, and the base URL a gate job chooses);
- `Check the built artifact` then failed for want of the site it checks, and
  was marked "no verdict".

So the exit code was 4, no verdict, and that was true however long the run was
allowed. The advice to re-run by name could never have produced a pass.

## Two small fixes

A local run already behaves as a pull request: steps whose `if:` is false
on a pull request are skipped. The event name now resolves to
`pull_request`, and the one compound form the workflows use
(`github.event_name != 'x' && 'a' || 'b'`) is evaluated against it. The
gate's base URL resolves to `https://marisstella.app/`, which is what the
gate outputs in production and what the site builder defaults to, and a
test keeps the two in step. Every other step output still keeps its step
skipped.

Then the budget. It was per workflow, so the five quick workflows a
post diff selects finished in seconds and their unused time was thrown away.
The sweep now runs workflows cheapest first by their declared
`timeout-minutes` and pools the budget: each one gets what the earlier ones
left, less a full share kept for each workflow still to come. The worst case is
unchanged, and no workflow gets less than before.

One more turned up when the whole sweep ran on this change. Every diff
selects the cross-review workflow, whose only local step always skips, and
the tool counted "nothing ran" as a failure. So every sweep exited 1 with
nothing failed. It now counts as no verdict, which is what it is.

## The result

The same command after the fix: 12 of 12 run steps passed, exit 0, in 4
minutes 37 seconds (with the share-card cache warm from the first run). It
is the first time the site workflow has given a local verdict. The
numbers and the remaining gap (a cold first run still needs about eight
minutes) are in
[the history note](../history/run-workflow-locally-pooled-budget-2026-11-15.md).
