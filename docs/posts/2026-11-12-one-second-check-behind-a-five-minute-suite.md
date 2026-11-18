---
title: "The one-second check that waited behind a five-minute suite"
seo_title: "Running parallel CI jobs in series locally: put quick checks first"
date: 2026-11-12
tags: [process, ci, testing, python, github-actions]
description: "Our local CI runner ran parallel jobs one after another, so a 300 s test suite used up the time budget before a 0.2 s post check ran. Quick checks now go first."
---

The repository has a tool, `platform/ci/run_workflow_locally.py`, that reads
the GitHub Actions workflows a diff would trigger and runs their read-only
steps in the agent's own container. With `--for-changes`, each workflow gets a
time budget (300 s by default), so one slow workflow cannot hold up the rest.
Steps the budget never reached are reported as UNRUN, not as passes or
failures.

## The fault

`portfolio-pages.yml` has two jobs that GitHub runs in parallel: `test`, whose
site-builder suite takes about 300 s, and `build`, whose first real step is a
0.2 s check of blog post front matter. The local tool runs steps in the order
they appear in the file, so `test` came first and used up the whole budget.
`build`'s front-matter check was always reported UNRUN.

That is the check a research or creative diff that adds a post most needs.
A run on 2026-11-12 had exactly that problem: its only real fault was a
too-long post description, the sweep reported the check as UNRUN, and the
agent found the fault by running `check_post_frontmatter.py` by hand (run
record `2026-11-12-session_01XpHqych82NBiXrc86SViYj.json`, doc friction).

## The fix

In a budgeted sweep, a step whose whole command is one argument-free
`python3 platform/ci/check_*.py` now runs before everything else. These checks
need no earlier setup step or build output: `main_health.py` already runs all
of them on a bare checkout, in parallel, every time it is called. So running
them early cannot change a result. The two that need a built site
(`check_pages_links.py`, `check_built_site.py`) are left out. Runs by
workflow name, which have no budget, keep file order.

The same 30-second-budget run of portfolio-pages, after the change:

```
  (1 standalone check(s) first, so a long step cannot spend the budget before them)
  build / Check blog post front matter before the long build ... [ok    ] (0.2s)
  test / Day for the share-card cache ... [ok    ] (0.0s)
  test / Test the site builder ... [UNRUN ] (29.0s)
```

Before the change, the front-matter line read `[UNRUN ] (0.0s)`.

## What it does not do

It does not make the sweep shorter. The site-builder suite still takes its
300 s, and runs that need its result should still run portfolio-pages by name
in the background. The fix only stops a slow step from hiding the quick
checks that matter most for a post. Running independent jobs in parallel, as
CI does, would cover more steps, but two jobs writing to one working tree at
once is a bigger change than this one needed.
