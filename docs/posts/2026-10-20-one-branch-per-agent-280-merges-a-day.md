---
title: "One branch per agent, 280 merges a day: what the git history says works"
seo_title: "One branch per agent, 280 merges a day"
date: 2026-10-20
description: "From 8,350 pull requests: conflict overhead fell from 53% to 20% of commits once one shared file left every PR, and why main's CI was falsely red."
tags: [ai-agents, git, ci, software-engineering, measurement]
---

# One branch per agent, 280 merges a day: what the git history says works

About 16 AI coding-agent sessions work on this repository at once. Each one
follows the same git pattern. It branches from `main`, opens a pull request
after its first push, squash-merges the PR itself once CI is green, and fixes
forward if something breaks. There is no human review. This post checks how
that pattern is performing, using the repository's own history: 13,498
commits on `main` and the head of each of 8,350 pull requests. Every number
here is in [`docs/parallel-agents.md`](/docs/parallel-agents.md) with the
method.

The caveats: this is one repository over three weeks of October 2026. The
windows below are by merge date, and the last one is four days long.

## The pattern holds up, once the shared files are gone

| | Oct 2–13 | Oct 14–16 | Oct 17–20 |
|---|---:|---:|---:|
| merges to `main` a day | 55 | 196 | 280 |
| PRs that had to merge `main` back in | 66% | 39% | 22% |
| commits spent on conflicts and regeneration | 53% | 36% | 20% |
| files per PR, median | 2,339 | 8 | 6 |
| first commit to merge, median | 17 min | 4 min | 1 min |

In early October more than half of all commits were overhead, not work. The
cause was not the branching model. Nearly every PR (95%) rewrote the same
generated mirror of the site, about 2,700 files that served a server
retired on October 1. Any two PRs open at the same time conflicted on it.
Once the mirror left the PRs, the median PR went from 2,339 files to 6. The
overhead fell by more than half while the merge rate rose five-fold.

**For many parallel agents, the files they all touch matter far more than the
branching strategy.** A shared counter, registry or generated file turns
every pair of concurrent PRs into a conflict. Short-lived branches with squash
merges work well once each change stays inside its own directory.

The same shape is already back somewhere else: `research/_homepage/projects.json`
and `research/README.md` are each touched by about a quarter of PRs.

## `main` was red, but not because anything broke

`Portfolio validate` failed on 77 of the last 100 pushes to `main`. Every
failure came from one step, which asks whether this commit removed a live
product. It was answering a different question. On a push it compared the
commit with `main`'s tip at the moment the runner started. At 280 merges a
day a queued run starts about 10 merges late. Any product added in those 10
merges looked as if this commit had deleted it.

We reproduced it on one failed run. Checked against the later tip, commit
`04d30ea92` "removes" `hearth-and-horizon`, a product that landed 15 minutes
after it. Checked against its own parent, the same check passes. The fix is
to compare a push with the commit it was pushed onto (`github.event.before`).

A check that fails three times in four teaches every agent to merge on red,
and the one real failure hides among the false ones. At high merge rates,
**any CI step that reads "the current `main`" instead of "this commit's
parent" is a race.**

## What still costs

- **Most runs on `main` never finish.** The product test workflow cancels its
  previous run on the same branch, so on `main` each merge cancels the last
  one's tests: 44 of the last 100 were cancelled. Most commits never get a
  verdict.
- **What merges is rarely exactly what was tested.** A PR's head was a median
  of 1 commit (90th percentile: 5) behind `main` when it merged, and only 34%
  were on the tip. Small, separate diffs keep that cheap. A merge queue,
  which tests each PR on top of the ones ahead of it, would close the gap.
- **A check for the retired mirror** still takes 7.5 of the 10 minutes of the
  main validation job.

## What we'd tell another team running agents in parallel

1. Keep one short-lived branch per session, open the PR immediately, and
   squash-merge. It scales to hundreds of merges a day.
2. Measure which files most PRs touch, and remove every shared counter or
   registry from that list. That is where the cost is.
3. Make every CI check on `main` compare against the commit's own parent,
   and never cancel `main`'s runs.
4. Add a merge queue only after steps 2 and 3, when conflicts are rare and CI
   tells the truth.

What went wrong on the way here, and the alternatives we weighed:
[What went wrong with sixteen AI agents on one main branch](2026-10-20-what-went-wrong-sixteen-agents-one-main.md).
