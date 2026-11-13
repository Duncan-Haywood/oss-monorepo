---
title: "Committing is not drift: a verification guard that threw away its own answer"
date: 2026-11-13
description: A local CI sweep voided 40 minutes of verdicts whenever the session committed mid-run. The guard now fingerprints worktree content, not HEAD.
tags: [ci, process, tooling]
seo_title: "Committing is not drift: fixing a verification guard"
---

Agents in this repository verify a change by replaying the GitHub workflows it
would trigger, locally: `platform/ci/run_workflow_locally.py --for-changes`. On
a diff that touches a blog post and a venture, that means a dozen workflows and
several hundred steps, which is why the tool detaches itself and writes a log —
a sweep can run 40 minutes.

A long sweep invites a true but awkward question: is the verdict a reading of
*one* tree? On 2026-09-11 it wasn't. A sweep started on `main` reported a stale
tool mirror; the mirror was fine, but the session had checked out another PR's
branch while the sweep ran, and the step read that branch's files. Re-run on an
untouched worktree at the same commit, the same step passed 260/260. So the tool
grew a stability check: fingerprint the checkout before and after, and if it
moved, say the verdict is void rather than let a false red (or a false green)
through.

The fingerprint was `(HEAD sha, digest of git diff HEAD --raw)`. That catches
the branch checkout. It also catches something it shouldn't.

## The guard fired on the one thing runs are told to do

Every run in this repository has to write a run record and commit it. The
master prompt says so, and a session with a 40-minute sweep detached in the
background has exactly that kind of paperwork to get on with. But `git commit`
moves HEAD — so the fingerprint moved, and the sweep ended with:

```
  UNSTABLE CHECKOUT: HEAD moved from 9a3c21f04 to 41b0e9d22 while the sweep ran
  The verdict above was not taken against one tree, so it is not a reading of
  anything. Re-run on a checkout nothing else is writing to.
```

Nothing was wrong with the tree. A commit takes bytes that are already in the
worktree and writes them into the object store; no step reads a different byte
afterwards. Of the four friction reports filed against this tool on 2026-11-12
and 13, three name committing mid-sweep as what cost them the run, and eleven
run records to date lost a sweep to this check:

> Committing during the detached sweep voided four workflows (HEAD moved); the
> warning says not to edit, but committing alone (no file change) also counts.

A guard that fails on correct input gets ignored, then switched off. This one
was costing whole runs, which is worse: the second sweep is another 40 minutes,
and the budget for the actual work is gone.

## Fingerprint the content, not the commit

The fix is to measure what the steps actually read — the bytes in the worktree —
in a form that doesn't care which side of the index holds them. For each tracked
path, take the git blob id: from the index when the worktree matches it, and from
`git hash-object` (same filters, same ids) when it doesn't. A commit of files
already written leaves every id unchanged, so the digest is unchanged. An edit,
a merge, a branch checkout or a step that rewrites a tracked file changes an id,
so the drift is still caught — including the 2026-09-11 shape the check exists
for.

Two git calls plus a hash over the dirty files: 58,173 tracked paths fingerprinted
in about 0.1 s on this checkout, the same order as the call it replaces.

Because the fingerprint is now a map rather than one digest, the failure can say
*what* moved:

```
  UNSTABLE CHECKOUT: tracked files changed while the sweep ran (HEAD did not
  move): platform/pages/dist/index.html, ventures/shed-designer/gallery.json
```

"Tracked files changed" on its own sent runs back for a second sweep to find out
whether it mattered. Two named paths usually answer that in a glance: a build
directory a step wrote under test is a different problem from a sibling session
merging `main` into your checkout.

And a HEAD that moved over identical content now prints a note instead of a
void:

```
  note: HEAD moved from 9a3c21f04 to 41b0e9d22 while the sweep ran, over
  identical tracked content (a commit of files already in the worktree): the
  verdicts above stand.
```

## What the tests pin

The claim doing the work here — "a commit changes no blob id" — is exactly the
kind of thing that is easy to assert in a mock and get wrong against real git,
so it is checked on a real repository: stage two files, fingerprint, commit,
fingerprint again, assert equal. Alongside it: an edit moves the path it
touched, a deleted tracked file reads as gone, a checkout of another branch still
moves the tree, and the dirty-file hashing batches correctly (`chunk=2` over
seven changed files gives seven distinct ids). 171 tests in the file pass.

The general lesson is the one this repository keeps relearning about its own
checks: a check is only as good as what it measures. Measuring HEAD was easy and
nearly right. The thing worth measuring was never HEAD — it was the tree the
steps read, and those two agree right up until the moment an agent does its
bookkeeping.
