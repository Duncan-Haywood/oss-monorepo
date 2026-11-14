---
title: "A local CI sweep that cannot tell should say so, not exit 1"
seo_title: "Exit codes for a local CI sweep: failed versus no verdict"
date: 2026-11-14
tags: [process, ci, tooling]
description: "34 run records in three days read a red exit from the local workflow runner that meant nothing had failed. It now exits 5 for no verdict."
---

Every session here can check its pull request before CI does with `platform/ci/run_workflow_locally.py --for-changes`. It reads the workflow files, picks the ones the diff would start and runs their read-only steps on the session's own machine. Each workflow gets a 300-second budget so the sweep can't hang.

One workflow keeps running out of that budget. `portfolio-pages.yml` runs the site builder's test suite, and remote CI takes about six minutes for it. Any diff that touches a post, a story, a research page or a venture selects that workflow. That covers most pull requests. When the budget ran out, the sweep reported "no verdict" for the workflow. Its exit code was 1, the same code it gives for a failed test.

## What the run records said

Every run here writes a record with a `doc_friction` field listing what cost it time. From 12 to 14 November, 34 records named this sweep together with "budget", "no verdict", "exit 1", "UNRUN" or the site builder. Three examples:

- "ended 'DONE exit 1' only because steps that needed the skipped site build were UNRUN. For a docs or episode diff, an exit code that separates 'failed' from 'unverifiable here' would save a reading pass."
- "the exit 1 needs reading to see it is not a failure."
- "the PR's own CI was green within 4 minutes, so the local sweep cost more time than it saved."

Each of those runs had to scroll back through several minutes of output to learn that nothing had broken.

## The change

The sweep now has three outcomes instead of two:

| exit | meaning |
|---|---|
| 0 | every selected workflow passed |
| 1 | a step failed, the checkout moved during the sweep, or nothing was selected |
| 5 | no step failed, but a workflow ran out of budget or stopped after a skipped step |

Exit 5 still isn't a pass. A sweep with no verdict hasn't verified anything, and a red-team run on 13 November checked that such a sweep can never exit 0. The code had to stay nonzero. It also had to differ from 2 (a usage error) and 3 (the long run was handed to the background). When it fires, the last lines name the workflows that got no verdict and say that the pull request's CI decides them.

A failure anywhere still wins. If one workflow fails and another runs out of budget, the exit is 1, and a test now checks that.

## What this does not fix

Exit 5 makes the sweep honest, not fast. The site-builder suite still takes longer locally than the budget allows. Two things would close that gap. The suite could be made faster, which is perf-track work. Or the sweep could skip suites it knows will outrun their budget, saying so up front instead of after five minutes. For now, a run that sees exit 5 on a text-only diff can leave that workflow to CI and say so in its pull request.
