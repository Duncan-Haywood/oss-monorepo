---
title: "What went wrong with sixteen AI agents on one main branch, and the git alternatives we weighed"
seo_title: "Sixteen AI agents on one main branch: what went wrong"
date: 2026-10-20
description: "A postmortem of parallel AI agents merging to one branch: generated files, false-red CI, cancelled runs, and seven alternatives to the git workflow."
tags: [ai-agents, git, ci, postmortem, software-engineering]
---

# What went wrong with sixteen AI agents on one main branch, and the git alternatives we weighed

About sixteen AI coding-agent sessions work on this repository at the same
time, with no human review, and merge about 280 pull requests a day. The
companion post,
[One branch per agent, 280 merges a day](2026-10-20-one-branch-per-agent-280-merges-a-day.md),
measures the git workflow and finds that it works. This post covers what
went wrong on the way there, why, and which alternatives we considered. The
numbers come from the repository's own history (13,498 commits on `main`,
8,350 pull-request heads) and are recorded with their method in
[`docs/parallel-agents.md`](/docs/parallel-agents.md). The rules agents now
follow are in [`.github/prompts/parallel-git.md`](/.github/prompts/parallel-git.md).

## The workflow

Each session branches from `main`, opens a pull request on its first push,
squash-merges it once CI is green, and fixes forward if something breaks.
That is standard trunk-based development with short-lived branches. Nothing
about it is specific to agents, which is why the failures are useful to
anyone who adds many parallel workers to one repository.

## What went wrong

### 1. A generated file that every change rewrote

The site used to be served from a small Kubernetes cluster, and each change
regenerated a mirror of the whole site (about 2,700 files) for it. The
cluster was retired on October 1. The mirror kept being regenerated in every
pull request for about two more weeks, and it came back once afterwards
(6,202 files) before a check was added that fails if it returns.

While it was there, 95% of pull requests touched the same mirror file. Any
two open at once conflicted, and with a merge every few minutes almost every
pull request had another one ahead of it. In early October 53% of all
commits were conflict repair, regeneration and merging `main` back in.
Removing the mirror took the median pull request from 2,339 files to 6, and
that overhead fell to 20%.

**Lesson:** with many parallel workers, any file every change has to edit
becomes a bottleneck: a counter, a registry, a generated artifact. Generated
output that nothing serves should not be in git at all.

### 2. Counters pinned in tests

Tests and documents pinned totals of the whole tree, such as "mirrors 198 of
198 tools". Every new product changed the number, so every product PR
edited the same lines. A tool was written to sync the counts after the
fact, because the right number "can only be known on the merge result". It
fixed the symptom once per pull request. Deriving the count from the tree
fixes it for good.

### 3. A check that was always red

From late September the main validation workflow failed on every push to
`main` for more than 1,000 runs, over a rule for missing score rows. Every
agent reasonably read it as "already broken" and merged anyway. When a real
break arrived, it merged under the same red. A check that is always red
teaches everyone to ignore red.

### 4. A check that raced the branch it was checking

After that was fixed, the same workflow still failed on 77 of the last 100
pushes to `main`, all at one step: "no live product disappears". The step
compared the commit being tested with `main`'s tip *at the moment the runner
started*. Runners were scarce, so a run typically started about ten merges
after its commit landed. Any product added in those ten merges looked as if
this commit had deleted it.

We reproduced it on one failed run. Commit `04d30ea92`, checked against the
later tip, "removes" a product that landed 15 minutes after it. Checked
against its own parent, the same check passes. The fix is one line of
workflow: on a push, compare against the commit that was pushed onto
(`github.event.before`).

**Lesson:** at high merge rates, any CI step that fetches "current `main`"
is a race. Compare with the commit's own parent.

### 5. Runs that cancelled each other

The product test workflow cancels a branch's previous run when a new commit
arrives. That is sensible on a pull-request branch. On `main` it means each
merge cancels the last merge's tests: 44 of the last 100 runs on `main` were
cancelled, so most commits never got a verdict.

### 6. Work that never got a pull request

On October 5, 100 branches with 186 commits had no pull request, including
four finished products. The sessions had pushed and stopped. Every check in
the repository runs on a pull request or on `main`, so nothing noticed. The
fix was a rule that the pull request opens on the first push, plus a sweep
for stranded branches.

### 7. Our own session

This analysis had problems of its own. The repository's measurement script
did not finish within ten minutes in a cloud session, so the numbers were
recomputed by another route (fetching every pull-request head without file
contents takes 38 seconds). And while the CI runners were busy, the session
ended its turn with the write-up pushed but not merged. The owner had to ask
whether it had landed. An agent should report "pushed, CI queued, not
merged" in exactly those words.

## The alternatives we weighed

| Alternative | Verdict | Reasoning |
|---|---|---|
| Push straight to `main`, no pull requests | No | The pull request is what every check runs on. The 100 stranded branches show what happens to work without one. |
| A long-lived integration branch, merged to `main` in batches | No | Adds a second place to conflict and a second merge for every change, to save an overhead that is already 20% and falling. |
| Stacked pull requests | Rarely | They suit a chain of dependent changes by one author. Here changes are independent and small. |
| Rebasing instead of merging `main` in | No | It rewrites other sessions' branches and breaks their checkouts. Squash merges already keep `main` linear. |
| Locks or claims on shared files | Only for new product names | Sessions end without warning, and a lock held by a dead session is worse than none. Removing the shared file works better. |
| Splitting into several repositories | No | The bottlenecks were generated files and registries, not repository boundaries. Splitting would lose the shared tooling. |
| A merge queue with batching | Yes, next | 66% of pull requests merged on a `main` they were not tested against, a median of one commit behind. A queue tests each change on top of the ones ahead of it. |

The merge queue comes last on purpose. A queue runs more CI, and while CI
is falsely red or cancelled it adds cost without telling anyone the truth.
The order is: remove shared files, make CI compare against the right base,
stop cancelling `main`'s runs, then queue.

## What we would tell another team

- Keep the simple workflow: short branches, squash merges, fix forward. It
  scaled to 280 merges a day here.
- Measure which files most changes touch, and remove every shared counter,
  registry or generated artifact from that list. Most of the cost is there.
- Treat CI on `main` as a product. It must compare each commit with its own
  parent, it must not cancel itself, and a red check gets fixed or removed
  the same day.
- Anchor everything on the pull request, and open it on the first push.
