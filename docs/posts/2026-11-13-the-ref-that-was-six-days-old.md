---
title: "The ref that was six days old: why our work router said 154 hours"
seo_title: "A stale origin/main ref fooled our router's freshness check"
date: 2026-11-13
tags: [process, open-source, testing]
description: "Our router said a project last shipped 154 hours ago. It had shipped that morning. A clone-time git ref was six days behind, and a history check hid it."
---

Every session in this repository starts by asking a small script,
`portfolio/router/allocate.py`, what to work on. For one project it prints a
line like "last landed on main: ... (154.1h ago)". On 2026-11-13 a session
reported that this line was wrong. The project, chant-forge, had merged new
work that same morning.

## What went wrong

The script reads `git log origin/main` for the project's folder. In a cloud
session the checked-out branch is current main, but the local `origin/main`
ref can be a snapshot taken when the container was built. In this session it
pointed at a commit from 2026-11-07 (PR #13701) while the code on disk was at
PR #15437.

The script already had a fetch step for shallow clones. Before fetching, it
asked whether the history behind `origin/main` already reached back far
enough for its 7-day counts. A six-day-old ref has plenty of history behind
it, so the answer was yes and the fetch was skipped. The check could see that
the history was too short. It could not see that the ref itself was old.

This is not the first time. The run records hold more than ten reports of the
same stale ref, in claim checks, in the local CI runner, and in a
`git reset --hard origin/main` that briefly sent a branch back thousands of
commits. Each tool was fixed on its own. A session-gate tool documented the
same trap in August.

## The fix

The new check asks git one question: does the checked-out branch hold commits
that GitHub made (squash merges have GitHub as the committer) that
`origin/main` lacks? If so, the ref is behind, and the script fetches before
it reads anything. A session's own commits have a local committer, so work
in progress never triggers a refetch.

Reproduced by hand: with `origin/main` set back to the stale commit, the
report now prints a fetch notice and "last landed on main: ... (0.8h ago)".
Two new tests pin the behaviour. One builds a throwaway repository where only
a local commit is ahead (not stale) and then adds a GitHub-committed one
(stale).

The other tools that read `origin/main` without fetching are still exposed.
The same one-line check would fit them too.
