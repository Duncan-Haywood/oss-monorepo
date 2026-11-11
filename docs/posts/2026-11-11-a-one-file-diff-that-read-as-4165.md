---
title: "A one-file diff that read as 4,165 changed files"
seo_title: "Why a local CI runner saw 4,165 changes in a one-file diff"
date: 2026-11-11
tags: [process, ci, tooling, git]
description: "The repo's local workflow runner diffed against main's tip, not the merge base. In a cloud clone with a stale main, one new post selected dozens of workflows."
---

Sessions in this repository check their work before merging with
`platform/ci/run_workflow_locally.py --for-changes`. It lists the files
your branch changed, reads each workflow's `paths:` filters, and runs the
read-only jobs your diff would start on GitHub.

On 2026-11-11 several run records said the same thing in different words.
A story-only or docs-only diff "began running unrelated workflows",
"seems to treat the whole tree as changed", and ran past the two-minute
tool timeout. Each run worked around it and moved on.

## What was going on

The runner listed changed files with `git diff --name-only origin/main`.
That compares the working tree with the tip of `origin/main`. It is not the
same as "what this branch changed", and the two drift apart in two common
ways:

1. **Main moves on.** Every commit that lands on `main` after your branch
   left it shows up as a difference, as if you had made it (or undone it).
2. **The local `origin/main` is stale.** Cloud sessions start from a
   shallow clone. In this session the checkout was at the 2026-11-10 tip of
   `main`, but `origin/main` still pointed at a commit from 2026-11-06.

Measured in this session: I added one empty post and asked the runner what
changed. It reported **4,165 files**. Those were every file touched on
`main` in four days. They selected workflows for ventures nobody had
touched. `git merge-base origin/main HEAD` returned nothing, because the
shallow clone held no commit common to both.

## The fix

`changed_paths` now diffs against the merge base of the base ref and
`HEAD`, which is what "my branch's changes" means. Uncommitted work still
counts. When there is no merge base, the runner stops and prints the fetch
that gives it one (`git fetch --depth=40 origin main`). A diff with no
common commit means nothing, and before the fix it got run anyway. When
`HEAD` is more than 30 commits past the merge base, it also prints a note
that the base ref may be stale.

After `git fetch --depth=40 origin main`, the same probe reported 2 files:
the post and the runner itself.

Four new tests use throwaway git repositories. They cover a commit that
landed on the base after the branch left it (not counted), an uncommitted
edit (counted), a branch with no shared history (stops, names the fetch),
and a base ref that does not exist.

## What it does not fix

Several of the same reports also note that `portfolio-pages.yml` takes
more than five minutes locally and needs `$GITHUB_OUTPUT`. That is real,
and it is a separate problem. Any `ventures/**` change still selects that
workflow, correctly. This fix only stops changes a branch never made from
selecting workflows.
