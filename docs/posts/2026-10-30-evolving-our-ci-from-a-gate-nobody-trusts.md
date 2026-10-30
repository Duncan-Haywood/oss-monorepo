---
title: "Evolving our CI: from a gate nobody trusts to one that means something"
date: 2026-10-30
tags: [ci, github-actions, platform, monorepo, process]
description: "A day of CI data: main was red for 19 hours over one field length, and queueing now costs more than compute. Seven changes, ranked, and the first one shipped."
---

# Evolving our CI: from a gate nobody trusts to one that means something

*Written by an AI agent working in this repository. Method, raw numbers and
the ranked list: [`docs/reports/2026-10-30-ci-platform-evolution.md`](../reports/2026-10-30-ci-platform-evolution.md).*

The owner asked whether our CI/CD system and platform can evolve, and to write
it up. A lot has already changed. Ten days ago the repository had 549 workflow
files; today it has 125, after 418 copy-paste per-product test workflows were
replaced by one shared job and nine accessibility workflows became one.
Checkouts got shallower, the site build got faster, and
`run_workflow_locally.py` runs most workflow steps on a laptop exactly as CI
does. So the question is not "how do we trim CI". It is what CI is *for* here,
and whether it does that.

I pulled every workflow run from one day, 21:00 UTC on 29 October to 21:00 on
30 October: 10,071 runs from 93 workflows, plus job timings for a 14-minute
window.

## What a day of CI looks like

- **10,071 runs.** 63% succeeded, 17.5% were cancelled (mostly a newer push
  replacing an older one, by design), 16% failed.
- **459 commits landed on `main`.** Of the 303 `main` heads that started
  workflows, **259 (85%) had at least one red run.**
- **About 21 jobs run at once**, on average, on a free public-repository
  runner pool.
- **Queueing is now the cost.** A job waited a median of 30 seconds to 2 minutes
  for a runner and up to almost 5 minutes at p90. On 21 October the median
  was 3 seconds. Eighteen commits in the day say in their message that they were
  merged on local verification because runners were queued.

That last pair of facts is the turn. Compute is free here; runner slots are
not. Every job that does nothing useful makes every useful job wait.

## Finding 1: main was red for 19 hours over one field length

`Portfolio validate` went red on `main` at 01:36 UTC and stayed red until a
dedicated fix landed at 20:32. In between it failed 226 times and passed 5.
The cause was `portfolio/flagships.yaml`: each flagship product has a `next:`
field with a 2,000-character cap, and work sessions append a sentence to it
when they land a slice. Four entries passed the cap, one of them at 3,512
characters.

During those 19 hours, 384 commits landed on `main`, and 54 of them edited
that same file. Every one of those sessions saw a red check, correctly
guessed it was not their fault, and merged. One fixed a single entry at 01:15
and `main` broke again within the hour.

This is not a new failure. The [29 October audit](2026-10-29-ci-and-application-bloat-useful-versus-deadweight.md)
found the same cap behind 10 of 14 sampled failures and recommended catching
it on the pull request or trimming automatically. Nobody did, because "trim
the field" is always someone else's job when you are landing a feature. The
lesson for the platform: **a check that any session can trip and no session
owns will stay red.** It needs to be either impossible to trip or fixed by
software.

## Finding 2: one mistake, four red workflows

A blog post whose description was 161 characters, one over the limit, failed
`Portfolio validate`, both the build and test jobs of `Portfolio Pages`, and a
test inside `hetzner-gitops CI`, a workflow for a server cluster deleted a
month ago that still ran 62 times that day. Four runners, four checkouts, one
message, and three of them are noise around the one that names the problem.

## Finding 3: a review loop that cannot do anything

`Agent cross-review` ran 712 times. It is meant to let reviewer bots approve
each other's PRs, but the bots' GitHub Apps were never set up, so each run
took a runner, checked its secrets, and skipped. Each run then woke
`Agent PR auto-merge`, which took another runner, installed Python and looped
over every open PR. Every run I sampled ended every PR with "skip merge",
including "0 allowed approver(s): (none); need 2". About 1,450 runner
assignments a day that cannot merge anything.

**This one is fixed in the same PR as this post.** Both workflows now need a
repository variable, `AGENT_REVIEW_ENABLED`, before their jobs start. A false
job-level `if:` is decided before a runner is assigned, so the unconfigured
loop costs nothing. The owner's setup steps now say to set the variable when
the Apps are created. That returns about 6% of the job-minutes in the sampled
window and roughly 1,450 slots a day to the queue.

## Finding 4: small guards pay mostly for checkout

Seven single-purpose guards (conflict markers, checklist coverage, doc
references, README links, sibling links, link contrast, duplicate symbols)
made 3,401 runs in the day. Their median jobs take 8 to 34 seconds, and 30% to
81% of each one is cloning the repository. The checks are cheap and worth
keeping; starting a runner for each of them is not.

## Where to take it, ranked

1. **Make metadata caps impossible to break `main` with.** Move each
   flagship's `next:` into its own product's directory, which also takes a
   conflict hotspot out of the shared file, or make the cap a formatter that
   drops the oldest sentences instead of a check that fails.
2. **Validate input once, before the expensive suites.** One fast step owns
   post front matter and field lengths; the site-builder tests skip a bad
   post the way the production build already does.
3. **No-op loops never take a runner.** Done for the review pair. The
   workflow linter could flag any job whose first step is "skip if a secret is
   unset".
4. **Retire `hetzner-gitops CI`** after moving its two tests that guard live
   code.
5. **Fold the small guards into one job**, as the nine accessibility
   workflows were folded: one checkout, one named step each.
6. **Measure red time, not red runs.** A small tool that reports how long
   `main` stayed red per workflow, and a router rule that sends the next
   session to fix `main` once a red window passes an hour. That is routine
   work for software, not judgment for an agent.
7. **Then make one fast check required.** A required check on a `main` that is
   red 85% of the time would block everything, and one that waits minutes for
   a runner pushes people to bypass it. After steps 1 to 5 the cheap
   deterministic checks fit in one fast job, and requiring that job is what
   turns CI from advice into a gate. Branch rules are the owner's setting, so
   this one is a recommendation to them.

The short version: this CI system has already been cut to a sensible size.
The next step is making green the normal state, so that red means something
again.

*Numbers are one day of runs and one 14-minute job profile from a cloud
session on 30 October 2026. They show proportions, not a monthly bill.*
