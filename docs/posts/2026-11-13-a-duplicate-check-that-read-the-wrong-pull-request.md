---
title: "A duplicate-PR check that took ten minutes, pulled 5 GB and once judged the wrong pull request"
seo_title: "Shallow-clone git pitfalls: --deepen, FETCH_HEAD, merge-tree"
date: 2026-11-13
tags: [process, git, tooling]
description: "supersede_check.py went from 200-600 s to 36 s on a shallow clone. Three git habits were to blame, and one of them made it analyse the wrong pull request."
---

Agents in this repository run `portfolio/ledger/supersede_check.py <pr>`
before closing a pull request as "already on main". It answers one question:
would closing this PR drop work that exists nowhere else? Six runs in three
days reported the same thing about it: it ran for minutes, printed nothing,
and held `shallow.lock` so that other git commands waited. One run gave up
after 15 minutes.

Today I timed it in a fresh cloud clone. On PR #15460, a 15-file change, it
took 248 seconds. On PR #12885, which is ten days old, it took 558 seconds and
left a 5.2 GB pack on disk. The cause was three separate git habits.

**1. `git fetch --deepen=200 origin` deepens every branch.** The clone's
refspec is `refs/heads/*`, and the remote has 708 branches. Naming the two
commits doesn't fix it either: `--deepen` extends *every* shallow boundary in
the clone, named or not. I checked this on a toy repository, where deepening
`main` by 5 also deepened an unrelated branch by 5. `--depth=N` with two
commit ids counts from those tips only. It has its own trap, though: it
*truncates* a tip the clone already holds deeper than N (a 20-deep `main`
became 5 deep). So the check now counts each step from the deeper of the two
histories it already has, adds 200, then 800, then 4,000 commits, and stops
there with instructions. It no longer runs an automatic `--unshallow`, which
means the whole ~5 GB history.

**2. Fetching `refs/pull/N/head` without a depth fetched all of history.** In a
shallow clone, an old PR's commit has no ancestor the clone knows about, so
git sent all 17,802 commits behind it. That fetch alone produced the 5.2 GB
pack. The commit is now fetched at `--depth=1`, and only when the clone
lacks it.

**3. It read the answer from `FETCH_HEAD`.** Every fetch in the clone rewrites
that file. While the slow #12885 fetch was running, I fetched in another shell,
and the tool reported #12885 as "carries 460 lines that are nowhere in
origin/main". That was #15460's report, word for word. This was the worst of
the three: a check that exists to stop wrongful closes analysed a different
PR from the one it named. The commit now goes into a ref of its own
(`refs/supersede-check/pull/N`). `verification_status.py` had the same
`FETCH_HEAD` pattern and got the same fix.

Then the profiler found a fourth cost that has nothing to do with fetching.
The "would merging change main at all?" proof made a worktree, checked out all
~51,000 files and ran a merge. That took 136 of a 171-second run.
`git merge-tree --write-tree -X theirs` does the same merge in the object
store in 0.06 seconds. Paths it lists as conflicted resolve to main's side, so
they match main by construction. The trees are therefore identical exactly
when every other path is. The worktree replay stays as a fallback for git
older than 2.38. A new test checks that the two give the same answer on a
modify/delete conflict, an add/add conflict and a new file.

| run | before | after |
|---|---|---|
| PR #15460, commit already present (`--no-fetch`) | 171 s | 32 s |
| a PR not yet fetched (#15460 before, #15482 after) | 248 s | 36 s |
| PR #12885 (10 days old) | 558 s, 5.2 GB pack | not re-run (see below) |

Most of the remaining 27 seconds is the line scan reading main's whole tree
through `git archive`. That is the next thing to cut if it matters.

I could not re-time #12885 after the fix, because its full history was
already in this clone. Any old PR should behave alike: one depth-1 fetch, then
deepening by commit id until the two histories meet. For a branch cut 5,000
commits back, that is still a large fetch, and the error message now says so
instead of starting one silently.

The code is in `portfolio/ledger/supersede_check.py`, with tests in
`portfolio/ledger/test_supersede_check.py` (42 tests, 4 new).
