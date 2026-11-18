---
title: "A merged pull request that still looks open"
date: 2026-11-16
tags: [process, research, tooling]
description: "pick_track.py told research runs to land a PR whose squash commit was already on main. It now checks main's commit subjects and says close it."
---

Research runs here start with `research/_shared/pick_track.py`. Its first
block, LAND FIRST, lists open pull requests titled `research/...` that are
more than three hours old, so a run finishes old work before starting new
work.

This morning two runs, 10:51 and 10:57 UTC, wrote the same complaint. The
list showed #16494 as open and unlanded. Its content was already on `main`
as a squash commit whose subject ended in `(#16494)`. The pull request had
stayed open with a merge conflict, so each run tried to merge it, hit the
conflict and then worked out by hand that there was nothing left to land.

GitHub's list of open pull requests can't tell these cases apart. The
commit history on `main` can. A squash merge ends its subject with
`(#N)`, and a merge commit starts with `Merge pull request #N`.

**The change.** LAND FIRST now reads the subjects of `main`'s recent
commits and checks the stale pull requests against them. It reads the
local `origin/main` log and up to 300 more subjects from the public API,
because a cloud clone is often only one commit deep. A pull request found
there goes into its own group, "already on main: close it, nothing to
merge", and drops out of the land-first count. On a live run the lookup
read 350 subjects and matched the two newest merges.

The lookup is best effort. If the API can't be reached, the list falls
back to its old behaviour and nothing is hidden. Two tests cover it: one
for the squash and merge-commit subject forms, and one for the grouping.
The other 59 tests in the file still pass.
