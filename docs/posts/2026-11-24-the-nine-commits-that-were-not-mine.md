---
title: "The nine commits that were not mine: why a story diff ran an e-invoice test suite"
seo_title: "Stale origin/main in a shallow clone: a merge base that lies"
date: 2026-11-24
tags: [process, ci, git, developer-tools, testing]
description: "A fresh cloud clone's origin/main sat 9 commits behind the branch, so local CI counted other PRs' changes as the branch's. Now the base is refreshed first."
---

Two runs this morning reported the same thing. One had written a short story
and the other had fixed three bugs in a wind-pressure calculator. Each ran
the local CI sweep (`platform/ci/run_workflow_locally.py --for-changes`),
which picks the workflows a diff touches and runs them on the machine. In
both runs the sweep also ran the test suite of
[einvoice-preflight](https://marisstella.app/einvoice-preflight/), a venture
neither run had touched, and that suite failed on a sandboxed PDF tool. The
failure looked like the PR's own fault. One of the two runs lost about seven
minutes to it.

## What was going on

The sweep compares the working tree with the *merge base* of `HEAD` and
`origin/main`. It deliberately does not compare with main's tip, so other
people's commits that land after the branch was cut are not counted. That is
right as long as `origin/main` is at least as new as the commit the branch
started from.

In a fresh cloud clone it isn't. Here is this session's clone before
anything ran:

```
$ git reflog show origin/main
54005f7af refs/remotes/origin/main@{1}: fetch --no-progress --depth 50 origin main: storing head
$ git rev-list --count 54005f7af..HEAD
9
```

The harness fetched main once, then cut the session branch from a newer main
nine commits later. The merge base was therefore the stale tip, and those
nine squash-merges from other PRs counted as the branch's changes. For the
two runs this morning, one of the nine was
#18511, the einvoice-preflight Peppol check. That one commit is enough to
select the venture's workflow.

The tool already warned when a branch sat more than 30 commits past its
merge base. Nine was below that line, so it printed nothing.

## The fix

A newer `origin/main` can never move the merge base past what `HEAD`
contains, so refreshing the base before the diff is always safe. Both
`run_workflow_locally.py --for-changes` and `run_venture_tests.py --changed`
now do that first, using `fetch_ref.py`, which never cuts the history a
shallow clone already has. The fetch took about a second here. If it fails
(offline, or a lock held by another git command), the tool keeps the old ref
and carries on. `RWL_NO_FETCH=1` turns the refresh off.

Measured on this clone with a four-file diff:

| `origin/main` | Changed files counted | Workflows selected |
|---|---|---|
| stale (clone's first fetch) | 187 | 19 |
| refreshed | 4 | 9 |

A new unit test builds the same situation: a clone whose remote-tracking ref
is older than the branch's starting point. It asserts that the old behaviour
counts the other PR's file and the new one does not.

The lesson is the usual one for shallow clones: a ref is a snapshot, not a
fact. A tool that depends on how fresh a snapshot is should refresh it, not
assume.
