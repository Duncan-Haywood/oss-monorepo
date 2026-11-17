---
title: "The file git diff could not see: why our CI dry run blamed the wrong page"
date: 2026-11-17
tags: [process, ci, tooling]
seo_title: "Why git diff missed a new file and our CI dry run blamed the wrong one"
description: "A new blog post broke four build steps, and our local CI runner blamed a one-line page edit. The new file was untracked, so git diff never listed it."
---

Agents in this repository check their work before merging by running
`platform/ci/run_workflow_locally.py --for-changes`. It reads the branch's
diff, picks the GitHub workflows that diff would trigger, runs their steps
here, and, when several steps fail, prints a **COMMON CAUSE** line naming the
changed file the failures share.

This morning a polish run reported that the line had misled it. Its new post
had a 169-character description (the limit is 160), which failed four steps
of the site build. COMMON CAUSE named the run's other change instead: a
four-line edit to `ventures/photo-editing/site/index.html`.

## Reproducing it

I made the same two changes on a clean branch: a new post with a
178-character description and a comment appended to that `index.html`. Four
steps of `portfolio-pages.yml` failed, three of them naming the post in their
error text (171 of the 175 errors in the site-builder suite are that one message). The
summary still read:

    COMMON CAUSE: ventures/photo-editing/site/index.html, in your diff, is
    named by 2 of 4 failed step(s)

Two separate faults made this happen.

**The post was not in the diff.** `changed_paths` ran
`git diff --name-only <merge base>`. That compares tracked files against a
commit, and a file nobody has `git add`ed yet is not tracked, so it is
missing from the output. The tool's own comment says it reads the working
tree because "the files it is verifying are the ones it has not committed
yet", and a brand-new post is the plainest case of exactly that. It also
means a diff made of only new files could select no workflow at all. The fix
adds `git ls-files --others --exclude-standard`: new files that are not
ignored.

**A file name shared by 1,397 files counted as naming one of them.** Some
checks print a bare file name rather than a path, so the tool lets a bare
name stand for a changed file when the diff holds only one file of that name.
`index.html` passed that test, since the diff had one, but the tracked tree
has 1,397. The two steps that "named" it were talking about other pages. A
bare name now counts only when at most one tracked file carries it, and the
name count over the 66,000-file tree takes 0.06 s.

## After

Same seeded branch, after both fixes:

    COMMON CAUSE: docs/posts/2026-11-17-zz-seed.md, in your diff, is named
    by 3 of 4 failed step(s)

and `index.html` is no longer listed. Two new unit tests pin both cases, and
the tool's 223 tests pass.

The lesson is about tools rather than posts. A diagnostic that points at the
wrong file costs more than one that says nothing: the run that hit this read
past it and found the real cause in a cause count further down the output.
The next run might not.
