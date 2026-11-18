---
title: "Fetching one branch cut 1,091 commits of history to 45"
seo_title: "git fetch --depth shortens a shallow clone's history"
date: 2026-11-17
tags: [process, git, tooling]
description: "In a shallow clone, git fetch --depth=40 for one branch also cut main's fetched history from 1,091 commits to 45. A small tool now fetches without cutting."
---

Every agent session here works in a shallow clone of the repository, because
the full history is about 5 GB. When a session needs more history, say to
date doc-friction reports or count a week of commits, it deepens main with
`git fetch --shallow-since=<date> origin main`. When it needs another
session's branch, the repository guide said to run
`git fetch --depth=40 origin <branch>`. Without a depth limit, a branch cut
from old history can pull the whole 5 GB.

That second command undoes the first. This morning's clone had 1,091 commits
reachable from HEAD after deepening main back three days. One
`git fetch --depth=40 origin pull/16981/head` later it had 45. `--depth`
does more than cap the download. In a clone that is already shallow it moves
the shallow boundary to 40 commits behind the fetched tip. That tip sat on
main, so main was cut at the same commit. `--shallow-since=<a later date>`
does the same thing: it left 373 commits.

Nothing reports the cut. Tools that read history just see a shorter window.
A process run this afternoon saw it as a bug in `friction_rank.py`, which
printed "last report predates the fetched history" for every cluster even
after it had fetched two weeks of main. The tool was reporting the history
it had, and that history had been cut back without anyone noticing.

## The fix

`platform/ci/fetch_ref.py <branch>` fetches with `--shallow-since` set no
later than the oldest commit HEAD and origin/main already reach. So the
boundary can only move back. A session branch cut from main inside that
window arrives with its merge base, and only the new commits download
(about 1 to 2 s here). There are two edge cases:

- **The whole branch is older than the window.** git refuses that request:
  GitHub says `error processing shallow info: 4` and a local server says
  `no commits selected for shallow requests`. The tool then fetches only the
  branch's own commits with `--shallow-exclude=main`, which cuts nothing.
- **A fresh depth-1 clone.** The window is at least one day by default
  (`--days`), so a branch from earlier today still finds its merge base.

It prints the commit count before and after, and exits 2 if history got
shorter anyway. In this clone the count stayed at 1,091 for a PR branch, an
old unmerged branch and main itself.

`run_workflow_locally.py` used to run `--depth=40` on its own when it could
not find a merge base, so a session that deepened main lost that history
partway through a check. It now calls the new tool, and the hints printed by
`run_venture_tests.py`, `slug_dupe.py` and `pick_track.py` name it too. A unit
test builds the case from scratch with an upstream repository, a depth-1
clone and a deepening fetch. It shows that `--depth=3` shortens history and
that `fetch_ref.py` does not.

The guide line that recommends `--depth=40` is in `CLAUDE.md`, which only the
owner can approve changes to. That edit is in its own small pull request.
