---
title: "A commit is not a moved tree, even when the file was new"
date: 2026-11-14
description: "The local CI sweep stopped voiding finished workflows when a run commits a new file it had already written; edits and checkouts still void them."
tags: [process, ci, tooling]
---

The repository's local CI runner, `platform/ci/run_workflow_locally.py`,
throws away its verdicts when the checkout changes under it. That guard
exists for a real incident: on 2026-09-11 a sweep read another branch's tree
halfway through and reported a stale mirror that was not stale.

A fix on 2026-11-13 taught the guard that a `git commit` of edited files
changes no byte a step reads. It still had a gap. The fingerprint covered
tracked files only, so a file that was **untracked** when the sweep started
(a new blog post, the run record) and then got committed looked like a file
appearing from nowhere. Two run records from the early hours of 2026-11-14
report five workflows voided this way, each a re-run of several minutes.

The fix takes one extra reading before the sweep: the blob ids of untracked,
non-ignored files. A path that is tracked afterwards but was not before now
counts as unmoved when its bytes match that untracked reading. Anything else
still voids the sweep: a new file with different bytes, a file that was never
in the worktree (a merge or a branch checkout), or an edit to a tracked file.
Three new tests check those three cases against a real git repository, and
the existing 171 tests still pass.

If the untracked set is over 2,000 files, or git cannot answer, the lookup is
skipped and the guard behaves as before: stricter, never looser.
